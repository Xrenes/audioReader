import type { Lang } from '@/store/voiceStore';
import type { SynthRequest, SynthResult, TtsEngine, WordMark } from './types';
import { voicesForLang } from './voiceCatalog';
import { getAzureCreds } from '@/config/credentials';

/**
 * Azure Cognitive Services — Speech, via the REST endpoint (no SDK bundle needed).
 *
 *   POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
 *   headers: Ocp-Apim-Subscription-Key, X-Microsoft-OutputFormat, Content-Type: application/ssml+xml
 *
 * Word-boundary marks are not available over plain REST; for highlighting +
 * a precise seek map we can later switch to the WebSocket SDK. For now we
 * approximate marks from text length once we know the clip duration.
 */
export const azureEngine: TtsEngine = {
  id: 'azure',

  async available() {
    const c = await getAzureCreds();
    return Boolean(c?.key && c?.region);
  },

  async voices(lang: Lang) {
    // Static curated list; a live GET /voices/list call could replace this.
    return voicesForLang(lang);
  },

  async synth(req: SynthRequest, signal?: AbortSignal): Promise<SynthResult> {
    const c = await getAzureCreds();
    if (!c?.key || !c?.region) throw new Error('Azure Speech credentials not configured');

    const endpoint = `https://${c.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const format = 'audio-24khz-96kbitrate-mono-mp3';

    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Ocp-Apim-Subscription-Key': c.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': format,
        'User-Agent': 'audio-reader',
      },
      body: req.ssml,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 200)}`);
    }

    const audio = await res.arrayBuffer();
    const durationSec = estimateDuration(audio);
    return {
      audio,
      mime: 'audio/mpeg',
      marks: approxMarks(req.text, durationSec),
      durationSec,
    };
  },
};

/** ~96 kbit/s mono mp3 → bytes / (12000) ≈ seconds. Refined after decode. */
function estimateDuration(buf: ArrayBuffer): number {
  return Math.max(0.5, buf.byteLength / 12000);
}

/** Evenly distribute word marks across the clip as a stopgap seek map. */
function approxMarks(text: string, durationSec: number): WordMark[] {
  const marks: WordMark[] = [];
  const re = /\S+/g;
  const words: { offset: number; length: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) words.push({ offset: m.index, length: m[0].length });
  if (!words.length) return marks;
  const per = durationSec / words.length;
  words.forEach((w, i) => marks.push({ ...w, time: i * per }));
  return marks;
}
