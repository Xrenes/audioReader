import type { Lang } from '@/store/voiceStore';
import type { SynthRequest, SynthResult, TtsEngine, TtsVoice } from './types';

/**
 * Fallback engine using the browser's built-in speechSynthesis.
 * Quality is poor (this is the "robotic" sound we're trying to avoid) and it
 * cannot return an audio buffer — so it speaks directly and we fake a result.
 * Only used when no Azure key is configured / offline.
 */
export const browserEngine: TtsEngine = {
  id: 'browser',

  available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  async voices(lang: Lang): Promise<TtsVoice[]> {
    const all = await getVoices();
    const prefix = lang === 'bn' ? 'bn' : 'en';
    return all
      .filter((v) => v.lang.toLowerCase().startsWith(prefix))
      .map((v) => ({ id: v.voiceURI, label: `${v.name} (device)`, lang, tone: 'neutral' as const }));
  },

  synth(req: SynthRequest): Promise<SynthResult> {
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(req.text);
      u.rate = clamp(req.rate, 0.5, 2);
      u.pitch = clamp(1 + req.pitch / 12, 0, 2);
      const t0 = performance.now();
      u.onend = () =>
        resolve({
          audio: new ArrayBuffer(0),
          mime: 'audio/none',
          marks: [],
          durationSec: (performance.now() - t0) / 1000,
        });
      u.onerror = (e) => reject(new Error(`speechSynthesis: ${e.error}`));
      window.speechSynthesis.speak(u);
    });
  },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

let cached: SpeechSynthesisVoice[] | null = null;
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cached && cached.length) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const load = () => {
      cached = window.speechSynthesis.getVoices();
      if (cached.length) resolve(cached);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    setTimeout(() => resolve(cached ?? []), 1000);
  });
}
