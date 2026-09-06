import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * On-device storage:
 *  - pdfs:  the raw PDF bytes so the library works offline
 *  - audio: generated TTS clips, keyed by hash(text + voice + rate + pitch)
 *  - config: credentials + misc small settings
 */
interface ReaderDB extends DBSchema {
  pdfs: {
    key: string; // docId
    value: {
      id: string;
      title: string;
      bytes: ArrayBuffer;
      numPages: number;
      addedAt: number;
      lastOpenedAt: number;
    };
    indexes: { 'by-lastOpened': number };
  };
  audio: {
    key: string; // cache key
    value: {
      key: string;
      audio: ArrayBuffer;
      mime: string;
      durationSec: number;
      createdAt: number;
    };
    indexes: { 'by-createdAt': number };
  };
  config: {
    key: string;
    value: unknown;
  };
}

let dbp: Promise<IDBPDatabase<ReaderDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ReaderDB>> {
  if (!dbp) {
    dbp = openDB<ReaderDB>('audio-reader', 1, {
      upgrade(db) {
        const pdfs = db.createObjectStore('pdfs', { keyPath: 'id' });
        pdfs.createIndex('by-lastOpened', 'lastOpenedAt');

        const audio = db.createObjectStore('audio', { keyPath: 'key' });
        audio.createIndex('by-createdAt', 'createdAt');

        db.createObjectStore('config');
      },
    });
  }
  return dbp;
}

/** Stable cache key for a synthesized chunk. */
export async function audioCacheKey(parts: {
  text: string;
  voiceId: string;
  rate: number;
  pitch: number;
}): Promise<string> {
  const raw = `${parts.voiceId}|${parts.rate}|${parts.pitch}|${parts.text}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- PDF helpers ---

export async function savePdf(id: string, title: string, bytes: ArrayBuffer, numPages: number) {
  const db = await getDb();
  const now = Date.now();
  await db.put('pdfs', { id, title, bytes, numPages, addedAt: now, lastOpenedAt: now });
}

export async function listPdfs() {
  const db = await getDb();
  const all = await db.getAllFromIndex('pdfs', 'by-lastOpened');
  return all.reverse();
}

export async function loadPdf(id: string) {
  const db = await getDb();
  const rec = await db.get('pdfs', id);
  if (rec) {
    rec.lastOpenedAt = Date.now();
    await db.put('pdfs', rec);
  }
  return rec ?? null;
}

export async function deletePdf(id: string) {
  const db = await getDb();
  await db.delete('pdfs', id);
}

// --- audio cache helpers ---

export async function getCachedAudio(key: string) {
  const db = await getDb();
  return (await db.get('audio', key)) ?? null;
}

export async function putCachedAudio(rec: {
  key: string;
  audio: ArrayBuffer;
  mime: string;
  durationSec: number;
}) {
  const db = await getDb();
  await db.put('audio', { ...rec, createdAt: Date.now() });
}

/** Trim the audio cache to a byte budget, oldest first. */
export async function pruneAudioCache(maxBytes = 200 * 1024 * 1024) {
  const db = await getDb();
  const all = await db.getAllFromIndex('audio', 'by-createdAt');
  let total = all.reduce((n, r) => n + r.audio.byteLength, 0);
  for (const rec of all) {
    if (total <= maxBytes) break;
    await db.delete('audio', rec.key);
    total -= rec.audio.byteLength;
  }
}
