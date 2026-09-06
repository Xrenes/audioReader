import { engineAvailable } from './registry';
import { BrowserSpeaker } from '@/audio/browserSpeaker';

/**
 * Is *any* voice able to speak right now? — a configured neural engine
 * (Azure / ElevenLabs / XTTS) or the device's speechSynthesis with at
 * least one installed voice.
 */
export async function anyVoiceAvailable(): Promise<boolean> {
  const neural = await Promise.all(
    (['azure', 'elevenlabs', 'xtts'] as const).map((p) => engineAvailable(p)),
  );
  if (neural.some(Boolean)) return true;
  if (!BrowserSpeaker.supported()) return false;
  const voices = await BrowserSpeaker.voices();
  return voices.length > 0;
}
