/* ============================================================
   Web Audio playback engine.

   Design goals (the "peaceful, not disturbing" part):
     - decode all chunks up front so we have a real timeline → ±5 min seek works
     - schedule chunks back-to-back with a short crossfade so joins aren't abrupt
     - insert a gentle silent gap between paragraphs
     - fade in on play / fade out on pause, never a hard cut
   ============================================================ */

export interface LoadedChunk {
  id: string;
  buffer: AudioBuffer;
  /** extra silence to append after this chunk (paragraph gap), seconds */
  gapAfter: number;
}

export interface PlayerCallbacks {
  onTick?: (positionSec: number) => void;
  onChunkChange?: (chunkId: string | null) => void;
  onEnded?: () => void;
}

interface Scheduled {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** timeline position where this chunk starts, seconds */
  offset: number;
  duration: number;
}

export class AudioReaderPlayer {
  private ctx: AudioContext;
  private master: GainNode;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private chunks: LoadedChunk[] = [];
  private starts: number[] = []; // timeline offset of each chunk
  private total = 0;

  private scheduled: Scheduled[] = [];
  private startCtxTime = 0; // ctx.currentTime when playback (re)started
  private startPosition = 0; // timeline position at that moment
  private playing = false;
  private raf = 0;

  crossfadeMs = 120;
  fadeEdgesMs = 180;

  constructor(private cb: PlayerCallbacks = {}) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  get duration() {
    return this.total;
  }
  get position() {
    if (!this.playing) return this.startPosition;
    return Math.min(this.total, this.startPosition + (this.ctx.currentTime - this.startCtxTime));
  }
  get isPlaying() {
    return this.playing;
  }

  /** Un-suspend the AudioContext without changing play state (e.g. on screen wake). */
  wake() {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Provide the decoded timeline. Call before play(). */
  setTimeline(chunks: LoadedChunk[]) {
    this.stop();
    this.chunks = chunks;
    this.starts = [];
    let t = 0;
    for (const c of chunks) {
      this.starts.push(t);
      t += c.buffer.duration + c.gapAfter;
    }
    this.total = t;
    this.startPosition = 0;
  }

  async play() {
    if (this.playing || !this.chunks.length) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.playing = true;
    this.startCtxTime = this.ctx.currentTime;
    this.scheduleFrom(this.startPosition);
    this.fade(this.master.gain, 1, this.fadeEdgesMs);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    const pos = this.position;
    this.fade(this.master.gain, 0, this.fadeEdgesMs, () => this.teardownSources());
    this.playing = false;
    this.startPosition = pos;
    cancelAnimationFrame(this.raf);
    this.cb.onTick?.(pos);
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  /** Absolute seek in seconds. */
  seek(toSec: number) {
    const clamped = Math.max(0, Math.min(this.total, toSec));
    const wasPlaying = this.playing;
    this.teardownSources();
    this.startPosition = clamped;
    this.cb.onTick?.(clamped);
    this.cb.onChunkChange?.(this.chunkAt(clamped)?.id ?? null);
    if (wasPlaying) {
      this.startCtxTime = this.ctx.currentTime;
      this.scheduleFrom(clamped);
    }
  }

  /** Relative seek, e.g. skip(300) / skip(-300) for ±5 minutes. */
  skip(deltaSec: number) {
    this.seek(this.position + deltaSec);
  }

  /** Jump to the previous / next chunk boundary. */
  seekChunk(dir: -1 | 1) {
    const i = this.chunkIndexAt(this.position);
    const target = Math.max(0, Math.min(this.chunks.length - 1, i + dir));
    this.seek(this.starts[target]);
  }

  stop() {
    this.teardownSources();
    this.playing = false;
    this.startPosition = 0;
    cancelAnimationFrame(this.raf);
  }

  setMasterVolume(v: number) {
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  async setAmbient(buffer: AudioBuffer | null, level: number) {
    this.ambient?.src.stop();
    this.ambient = null;
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this.ambient = { src, gain };
  }

  dispose() {
    this.stop();
    this.ambient?.src.stop();
    void this.ctx.close();
  }

  // --- internals ---

  private scheduleFrom(position: number) {
    const xfade = this.crossfadeMs / 1000;
    const now = this.ctx.currentTime;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunkStart = this.starts[i];
      const chunkEnd = chunkStart + this.chunks[i].buffer.duration;
      if (chunkEnd <= position) continue; // already passed

      const into = Math.max(0, position - chunkStart); // start offset within buffer
      const when = now + Math.max(0, chunkStart - position);

      const src = this.ctx.createBufferSource();
      src.buffer = this.chunks[i].buffer;
      const gain = this.ctx.createGain();
      src.connect(gain).connect(this.master);

      const dur = this.chunks[i].buffer.duration - into;
      // micro fade at chunk edges to avoid clicks / abrupt joins
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, when + Math.min(xfade, dur / 2));
      gain.gain.setValueAtTime(1, when + Math.max(0, dur - xfade));
      gain.gain.linearRampToValueAtTime(0, when + dur);

      src.start(when, into);
      src.stop(when + dur + 0.02);

      const sched: Scheduled = { id: this.chunks[i].id, src, gain, offset: chunkStart, duration: dur };
      this.scheduled.push(sched);

      src.onended = () => {
        this.scheduled = this.scheduled.filter((s) => s !== sched);
        if (this.playing && this.position >= this.total - 0.05) {
          this.playing = false;
          this.startPosition = this.total;
          cancelAnimationFrame(this.raf);
          this.cb.onEnded?.();
        }
      };
    }
  }

  private teardownSources() {
    for (const s of this.scheduled) {
      try {
        s.src.onended = null;
        s.src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = [];
  }

  private tick = () => {
    if (!this.playing) return;
    const pos = this.position;
    this.cb.onTick?.(pos);
    this.cb.onChunkChange?.(this.chunkAt(pos)?.id ?? null);
    if (pos >= this.total) {
      this.playing = false;
      this.cb.onEnded?.();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private chunkIndexAt(pos: number): number {
    let i = 0;
    for (let k = 0; k < this.starts.length; k++) if (this.starts[k] <= pos) i = k;
    return i;
  }
  private chunkAt(pos: number): LoadedChunk | null {
    return this.chunks[this.chunkIndexAt(pos)] ?? null;
  }

  private fade(param: AudioParam, to: number, ms: number, done?: () => void) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + ms / 1000);
    if (done) window.setTimeout(done, ms + 20);
  }
}

/** Decode an encoded clip into an AudioBuffer using a shared context. */
let decodeCtx: AudioContext | null = null;
export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  if (!decodeCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new Ctx();
  }
  return decodeCtx.decodeAudioData(data.slice(0));
}
