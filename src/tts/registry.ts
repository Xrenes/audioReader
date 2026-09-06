import type { TtsEngine } from './types';
import type { ProviderId } from './voiceManager';
import { azureEngine } from './azureEngine';
import { elevenLabsEngine } from './elevenLabsEngine';
import { piperEngine } from './piperEngine';
import { xttsEngine } from './xttsEngine';
import { browserEngine } from './browserEngine';

/** Map a resolved provider to its engine implementation. */
const ENGINES: Record<ProviderId, TtsEngine> = {
  azure: azureEngine,
  elevenlabs: elevenLabsEngine,
  piper: piperEngine,
  xtts: xttsEngine,
  browser: browserEngine,
};

export function getEngine(provider: ProviderId): TtsEngine {
  return ENGINES[provider] ?? browserEngine;
}

/** Is the engine for this provider usable right now (keys present)? */
export async function engineAvailable(provider: ProviderId): Promise<boolean> {
  return Boolean(await getEngine(provider).available());
}
