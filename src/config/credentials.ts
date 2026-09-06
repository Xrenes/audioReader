/**
 * Local-only credential storage.
 *
 * This is a personal PWA: the Azure Speech key lives in the browser's
 * IndexedDB on your own device and is never sent anywhere except directly
 * to Azure's TTS endpoint. If you ever share this app publicly, move
 * synthesis behind a tiny proxy so the key isn't shipped to clients.
 */
import { getDb } from '@/storage/db';

export interface AzureCreds {
  key: string;
  region: string; // e.g. "southeastasia", "eastus"
}

export interface ElevenLabsCreds {
  key: string;
}

const AZURE_KEY = 'azure';
const ELEVEN_KEY = 'elevenlabs';
const XTTS_KEY = 'xtts_url';
const XTTS_DEFAULT = 'http://localhost:8020';

export async function getAzureCreds(): Promise<AzureCreds | null> {
  // env override for local dev convenience
  const envKey = import.meta.env.VITE_AZURE_SPEECH_KEY as string | undefined;
  const envRegion = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined;
  if (envKey && envRegion) return { key: envKey, region: envRegion };

  const db = await getDb();
  return ((await db.get('config', AZURE_KEY)) as AzureCreds | undefined) ?? null;
}

export async function setAzureCreds(creds: AzureCreds | null): Promise<void> {
  const db = await getDb();
  if (creds) await db.put('config', creds, AZURE_KEY);
  else await db.delete('config', AZURE_KEY);
}

export async function getElevenLabsCreds(): Promise<ElevenLabsCreds | null> {
  const envKey = import.meta.env.VITE_ELEVENLABS_KEY as string | undefined;
  if (envKey) return { key: envKey };

  const db = await getDb();
  return ((await db.get('config', ELEVEN_KEY)) as ElevenLabsCreds | undefined) ?? null;
}

export async function setElevenLabsCreds(creds: ElevenLabsCreds | null): Promise<void> {
  const db = await getDb();
  if (creds) await db.put('config', creds, ELEVEN_KEY);
  else await db.delete('config', ELEVEN_KEY);
}

/**
 * URL of the local XTTS voice-cloning server (xtts-server/). Empty string
 * disables the provider. Defaults to http://localhost:8020.
 */
export async function getXttsUrl(): Promise<string> {
  const env = import.meta.env.VITE_XTTS_URL as string | undefined;
  if (env !== undefined) return env;
  const db = await getDb();
  const stored = (await db.get('config', XTTS_KEY)) as string | undefined;
  return stored ?? XTTS_DEFAULT;
}

export async function setXttsUrl(url: string | null): Promise<void> {
  const db = await getDb();
  if (url) await db.put('config', url, XTTS_KEY);
  else await db.put('config', '', XTTS_KEY);
}
