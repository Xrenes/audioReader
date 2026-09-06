import type { TtsVoice } from './types';

/**
 * Curated shortlist of calm-leaning neural voices.
 * `tone: 'calm'` voices are surfaced first in the picker — the whole point
 * of this app is that listening should feel peaceful, not like an assistant.
 */
export const AZURE_VOICES: TtsVoice[] = [
  // --- English ---
  {
    id: 'en-US-AriaNeural',
    label: 'Aria — soft, warm',
    lang: 'en',
    tone: 'calm',
    styles: ['calm', 'narration-professional', 'gentle'],
  },
  {
    id: 'en-US-JennyNeural',
    label: 'Jenny — mellow',
    lang: 'en',
    tone: 'calm',
    styles: ['calm', 'assistant'],
  },
  {
    id: 'en-US-DavisNeural',
    label: 'Davis — low, steady',
    lang: 'en',
    tone: 'calm',
    styles: ['calm', 'chat'],
  },
  {
    id: 'en-GB-SoniaNeural',
    label: 'Sonia — British, even',
    lang: 'en',
    tone: 'neutral',
    styles: ['calm', 'newscast'],
  },
  { id: 'en-US-GuyNeural', label: 'Guy — neutral', lang: 'en', tone: 'neutral' },

  // --- Bangla (bn-BD) ---
  { id: 'bn-BD-NabanitaNeural', label: 'Nabanita — gentle', lang: 'bn', tone: 'calm' },
  { id: 'bn-BD-PradeepNeural', label: 'Pradeep — steady', lang: 'bn', tone: 'neutral' },
  // bn-IN alternatives (Indian Bangla) if bn-BD is unavailable in a region
  { id: 'bn-IN-TanishaaNeural', label: 'Tanishaa — bn-IN', lang: 'bn', tone: 'neutral' },
  { id: 'bn-IN-BashkarNeural', label: 'Bashkar — bn-IN', lang: 'bn', tone: 'neutral' },
];

export function voicesForLang(lang: 'en' | 'bn'): TtsVoice[] {
  return AZURE_VOICES.filter((v) => v.lang === lang).sort((a, b) => {
    const rank = { calm: 0, neutral: 1, bright: 2, undefined: 3 } as const;
    return (rank[a.tone ?? 'undefined'] ?? 3) - (rank[b.tone ?? 'undefined'] ?? 3);
  });
}
