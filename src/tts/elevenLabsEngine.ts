import type { Lang } from '@/store/voiceStore';
import type { SynthRequest, SynthResult, TtsEngine } from './types';
import { getElevenLabsCreds } from '@/config/credentials';

/**
 * ElevenLabs TTS via REST.
 *
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 *   headers: xi-api-key, Accept: audio/mpeg
 *   body: { text, model_id, voice_settings }
 *
 * ElevenLabs has no SSML, so the calm shaping we do here is:
 *   - feed clean, fully-joined sentences (done upstream in preprocess)
 *   - lower `style`, moderate `stability` for an even, unrushed read
 *   - rate/pitch are applied at playback time via Web Audio, not here
 *
 * `eleven_multilingual_v2` also handles Bangla passably, but we route bn
 * to Azure by default in voices.json for stronger pronunciation.
 */
export const elevenLabsEngine: TtsEngine = {
  id: 'elevenlabs',

  async available() {
    const c = await getElevenLabsCreds();
    return Boolean(c?.key);
  },

  async voices(_lang: Lang) {
    // Voice choice comes from voices.json, not a live list.
    return [];
  },

  async synth(req: SynthRequest, signal?: AbortSignal): Promise<SynthResult> {
    const c = await getElevenLabsCreds();
    if (!c?.key) throw new Error('ElevenLabs API key not configured');

    const voiceId = req.voiceId;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'xi-api-key': c.key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: req.text,
        model_id: req.modelId ?? 'eleven_multilingual_v2',
        voice_settings: req.settings ?? { stability: 0.5, similarity_boost: 0.75, style: 0 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
    }

    const audio = await res.arrayBuffer();
    return {
      audio,
      mime: 'audio/mpeg',
      marks: [],
      durationSec: Math.max(0.5, audio.byteLength / 16000), // ~128kbit/s mp3
    };
  },
};
