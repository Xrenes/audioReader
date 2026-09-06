import type { Lang } from '@/store/voiceStore';

/** Bengali Unicode block: U+0980 – U+09FF */
const BENGALI = /[ঀ-৿]/;

/**
 * Cheap, reliable language routing for our two supported languages.
 * We only need to tell Bangla script from Latin — no library required.
 * If a passage mixes both, we go with whichever script owns more characters.
 */
export function detectLang(text: string): Lang {
  let bn = 0;
  let latin = 0;
  for (const ch of text) {
    if (BENGALI.test(ch)) bn++;
    else if (/[A-Za-z]/.test(ch)) latin++;
  }
  return bn > latin ? 'bn' : 'en';
}

/** Split a passage into runs of a single language so each goes to the right voice. */
export function splitByLang(text: string): { text: string; lang: Lang }[] {
  const sentences = text.split(/(?<=[।.!?])\s+/).filter(Boolean);
  const runs: { text: string; lang: Lang }[] = [];
  for (const s of sentences) {
    const lang = detectLang(s);
    const last = runs[runs.length - 1];
    if (last && last.lang === lang) last.text += ' ' + s;
    else runs.push({ text: s, lang });
  }
  return runs;
}
