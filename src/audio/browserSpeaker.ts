/* ============================================================
   Managed wrapper around window.speechSynthesis.

   The neural path (Azure / ElevenLabs / XTTS) returns audio buffers we
   play through Web Audio with a real timeline. speechSynthesis can't do
   that — it just speaks — so this gives the UI something coherent:
   sequential clause-level playback with natural gaps, real pause / resume
   / stop, an approximate position, and honest errors.

   It also picks the *best* available system voice (preferring online /
   "Natural" / "Neural" ones) and splits text at clause boundaries so any
   voice reads more smoothly and less choppily.
   ============================================================ */

export interface SpeakChunk {
  id: string;
  text: string;
  lang: 'en' | 'bn';
  rate: number; // 0.5–2 (user speed)
  pitch: number; // semitones (mapped to 0–2)
}

export interface BrowserSpeakerCallbacks {
  onChunk?: (id: string, index: number) => void;
  onProgress?: (approxSec: number, estTotalSec: number) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** One thing we actually hand to an utterance: a clause, plus the gap after it. */
interface Unit {
  chunkId: string;
  text: string;
  gapMs: number;
}

const WPM = 150; // calm reading pace, for the position estimate

/** rank a voice: higher = more natural-sounding */
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (/natural|neural/.test(n)) s += 100;
  if (!v.localService) s += 40; // online voices are usually much better
  if (/google/.test(n)) s += 30;
  if (/microsoft/.test(n) && /online|natural/.test(n)) s += 25;
  if (/premium|enhanced|siri/.test(n)) s += 20;
  if (/zira|david|mark|hazel/.test(n)) s -= 10; // the classic robotic set
  if (/espeak|festival/.test(n)) s -= 50;
  return s;
}

/** Split a sentence into clause-sized units so pauses land in natural places. */
function toUnits(chunkId: string, text: string, paragraphEnd: boolean): Unit[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  // break after . ! ? … । and after , ; : — ) when followed by a space,
  // keeping the delimiter attached to the left piece
  const pieces = clean
    .split(/(?<=[.!?…।])\s+|(?<=[,;:—)])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: Unit[] = [];
  pieces.forEach((p, i) => {
    const last = i === pieces.length - 1;
    const endsSentence = /[.!?…।]$/.test(p);
    let gap = 90; // tiny breath between clauses
    if (endsSentence) gap = last && paragraphEnd ? 650 : 380;
    else if (/[;:—]$/.test(p)) gap = 260;
    else if (/,$/.test(p)) gap = 180;
    units.push({ chunkId, text: p, gapMs: gap });
  });
  return units;
}

export class BrowserSpeaker {
  private synth = window.speechSynthesis;
  private units: Unit[] = [];
  private idx = 0;
  private playing = false;
  private startedAt = 0;
  private elapsedBefore = 0;
  private estTotal = 0;
  private raf = 0;
  private gapTimer = 0;
  private voices: SpeechSynthesisVoice[] = [];
  private forcedVoiceURI: string | null = null;

  constructor(private cb: BrowserSpeakerCallbacks = {}) {}

  static supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Voices can load late; resolve once we have them (or give up after ~1.5s). */
  static voices(): Promise<SpeechSynthesisVoice[]> {
    const s = window.speechSynthesis;
    const now = s.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((res) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        res(s.getVoices());
      };
      s.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  /** Voices for a language, best first — for a picker UI. */
  static async voicesFor(lang: 'en' | 'bn'): Promise<SpeechSynthesisVoice[]> {
    const all = await BrowserSpeaker.voices();
    const pfx = lang === 'bn' ? 'bn' : 'en';
    return all
      .filter((v) => v.lang.toLowerCase().startsWith(pfx))
      .sort((a, b) => voiceScore(b) - voiceScore(a));
  }

  /** Pin a specific voice (by voiceURI); null = auto-pick the best. */
  setVoiceURI(uri: string | null) {
    this.forcedVoiceURI = uri || null;
  }

  async load(chunks: SpeakChunk[]) {
    this.stop();
    this.units = [];
    chunks.forEach((c, ci) => {
      const paraEnd = c.id.endsWith(':pend') || ci === chunks.length - 1;
      this.units.push(...toUnits(c.id, c.text, paraEnd));
    });
    this.idx = 0;
    this.elapsedBefore = 0;
    const words = this.units.reduce((n, u) => n + u.text.split(/\s+/).length, 0);
    const gapSec = this.units.reduce((n, u) => n + u.gapMs, 0) / 1000;
    this.estTotal = (words / WPM) * 60 + gapSec;
  }

  get estTotalSec() {
    return this.estTotal;
  }
  get isPlaying() {
    return this.playing;
  }

  async play() {
    if (this.playing || !this.units.length) return;
    this.voices = await BrowserSpeaker.voices();
    if (!this.voices.length) {
      this.cb.onError?.(
        'This browser has no speech voices installed, so it can’t speak. On Windows: Settings → Time & language → Speech → add voices. Or add an Azure/ElevenLabs key in settings for a natural voice.',
      );
      return;
    }
    this.playing = true;
    this.startedAt = performance.now();
    this.tick();
    this.speakFrom(this.idx);
  }

  pause() {
    if (!this.playing) return;
    this.synth.pause();
    window.clearTimeout(this.gapTimer);
    this.playing = false;
    this.elapsedBefore += (performance.now() - this.startedAt) / 1000;
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (!this.units.length) return;
    const wasPlaying = this.playing;
    this.playing = true;
    if (!wasPlaying) this.startedAt = performance.now();
    this.synth.resume();
    if (!wasPlaying) this.tick();
    // if speech is stalled (OS suspended it on lock, or paused between
    // units), kick the chain from the current unit
    if (!this.synth.speaking && !this.synth.pending) this.speakFrom(this.idx);
  }

  /** Recover after the OS suspended speechSynthesis (screen lock). */
  recover() {
    if (!this.playing) return;
    this.synth.resume();
    if (!this.synth.speaking && !this.synth.pending) this.speakFrom(this.idx);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.resume();
  }

  stop() {
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    window.clearTimeout(this.gapTimer);
    this.playing = false;
    this.elapsedBefore = 0;
    this.idx = 0;
    cancelAnimationFrame(this.raf);
  }

  private pickVoice(lang: 'en' | 'bn'): SpeechSynthesisVoice | undefined {
    if (this.forcedVoiceURI) {
      const forced = this.voices.find((v) => v.voiceURI === this.forcedVoiceURI);
      if (forced) return forced;
    }
    const pfx = lang === 'bn' ? 'bn' : 'en';
    const pool = this.voices.filter((v) => v.lang.toLowerCase().startsWith(pfx));
    const ranked = (pool.length ? pool : this.voices).sort((a, b) => voiceScore(b) - voiceScore(a));
    return ranked[0];
  }

  private speakFrom(i: number) {
    if (!this.playing) return;
    if (i >= this.units.length) {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.cb.onDone?.();
      return;
    }
    const u = this.units[i];
    this.idx = i;
    this.cb.onChunk?.(u.chunkId, i);

    const su = new SpeechSynthesisUtterance(u.text);
    const chunkLang: 'en' | 'bn' = /[ঀ-৿]/.test(u.text) ? 'bn' : 'en';
    const picked = this.pickVoice(chunkLang);
    if (picked) su.voice = picked;
    su.lang = picked?.lang ?? (chunkLang === 'bn' ? 'bn-BD' : 'en-US');

    // pull the live user speed each unit so the player slider is responsive
    const rate = clamp(currentRate(), 0.5, 2);
    su.rate = rate;
    su.pitch = clamp(1 + currentPitch() / 12, 0, 2);

    su.onend = () => {
      if (!this.playing) return;
      // natural gap, scaled down a little as the user speeds up
      const gap = u.gapMs / Math.max(0.8, rate);
      this.gapTimer = window.setTimeout(() => this.speakFrom(i + 1), gap);
    };
    su.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        this.cb.onError?.(`Device voice error: ${e.error}`);
      }
    };
    this.synth.speak(su);
  }

  private tick = () => {
    if (!this.playing) return;
    const now = this.elapsedBefore + (performance.now() - this.startedAt) / 1000;
    this.cb.onProgress?.(Math.min(now, this.estTotal), this.estTotal);
    this.raf = requestAnimationFrame(this.tick);
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/* live speed/pitch pulled from the voice store without importing it here
   (avoids a cycle); set by useReadingSession before play. */
let _rate = 0.9;
let _pitch = -2;
export function setBrowserSpeakerParams(rate: number, pitch: number) {
  _rate = rate;
  _pitch = pitch;
}
function currentRate() {
  return _rate;
}
function currentPitch() {
  return _pitch;
}
