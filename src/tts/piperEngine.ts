import type { Lang } from '@/store/voiceStore';
import type { SynthRequest, SynthResult, TtsEngine } from './types';

/**
 * Offline neural TTS via Piper.
 *
 * NOT WIRED YET. The `piper-tts-web` package ships a single ~45 MB bundle that
 * inlines @huggingface/transformers and uses `eval` (CSP-hostile), which fights
 * the PWA build. Deferred until we either:
 *   - self-host a slim build (onnxruntime-web + a JS phonemizer + Piper .onnx
 *     models fetched from HuggingFace), or
 *   - run Piper as a local sidecar HTTP server.
 *
 * `voices.json` may still name `"provider": "piper"`; until this is implemented
 * `available()` returns false so the reading session falls back to the device
 * voice (or another configured provider).
 *
 * When implemented, `voiceId` is a Piper voice key like "en_US-ryan-medium",
 * optionally "<key>#<speaker>" for multi-speaker models.
 */
export const piperEngine: TtsEngine = {
  id: 'browser',

  available() {
    return false; // not implemented yet — see note above
  },

  async voices(_lang: Lang) {
    return [];
  },

  async synth(_req: SynthRequest): Promise<SynthResult> {
    throw new Error('Piper offline engine is not wired up yet');
  },
};
