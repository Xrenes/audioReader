import type { Lang } from '@/store/voiceStore';
import type { SynthRequest, SynthResult, TtsEngine } from './types';
import { getXttsUrl } from '@/config/credentials';

/**
 * Local Coqui XTTS-v2 voice-cloning server (see xtts-server/).
 * Reads any text in a voice you supplied as a short reference clip.
 *
 *   POST {baseUrl}/tts  { text, voice, language, speed }  -> audio/wav
 *
 * `voiceId` is the reference clip's file stem, e.g. "my_voice" for
 * xtts-server/voices/my_voice.wav.
 */
export const xttsEngine: TtsEngine = {
  id: 'xtts',

  async available() {
    const base = await getXttsUrl();
    if (!base) return false;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) return false;
      const j = await res.json();
      return Boolean(j?.ok);
    } catch {
      return false;
    }
  },

  async voices(_lang: Lang) {
    const base = await getXttsUrl();
    if (!base) return [];
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/voices`);
      const list = (await res.json()) as { id: string; seconds: number | null }[];
      return list.map((v) => ({
        id: v.id,
        label: `${v.id}${v.seconds ? ` · ${v.seconds}s clip` : ''}`,
        lang: 'en' as Lang,
        tone: 'calm' as const,
      }));
    } catch {
      return [];
    }
  },

  async synth(req: SynthRequest, signal?: AbortSignal): Promise<SynthResult> {
    const base = await getXttsUrl();
    if (!base) throw new Error('XTTS server URL not set');

    const res = await fetch(`${base.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        voice: req.voiceId,
        language: req.lang === 'bn' ? 'hi' : 'en', // XTTS has no bn; en is its strength
        speed: req.rate,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`XTTS ${res.status}: ${detail.slice(0, 200)}`);
    }

    const audio = await res.arrayBuffer();
    return {
      audio,
      mime: 'audio/wav',
      marks: [],
      durationSec: Math.max(0.5, audio.byteLength / (24000 * 2)),
    };
  },
};
