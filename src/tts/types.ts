import type { Lang } from '@/store/voiceStore';

export interface SynthRequest {
  ssml: string;
  /** plain text, for cache key + browser fallback */
  text: string;
  /** provider voice id (resolved from the named voice) */
  voiceId: string;
  lang: Lang;
  rate: number;
  pitch: number;
  /** ElevenLabs extras */
  modelId?: string;
  settings?: Record<string, number>;
}

export interface SynthResult {
  /** encoded audio (mp3/opus) for caching + Web Audio decode */
  audio: ArrayBuffer;
  mime: string;
  /** word boundary marks if the engine provides them (for highlighting + seek map) */
  marks: WordMark[];
  durationSec: number;
}

export interface WordMark {
  /** char offset into the plain text */
  offset: number;
  length: number;
  /** seconds from start of this chunk's audio */
  time: number;
}

export interface TtsEngine {
  id: 'azure' | 'elevenlabs' | 'piper' | 'xtts' | 'browser';
  /** true if usable right now (keys present / API available) */
  available(): boolean | Promise<boolean>;
  /** list selectable voices for a language */
  voices(lang: Lang): Promise<TtsVoice[]>;
  synth(req: SynthRequest, signal?: AbortSignal): Promise<SynthResult>;
}

export interface TtsVoice {
  id: string;
  label: string;
  lang: Lang;
  /** curated tag so the UI can nudge toward soothing options */
  tone?: 'calm' | 'neutral' | 'bright';
  styles?: string[];
}
