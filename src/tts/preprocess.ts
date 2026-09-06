/* ============================================================
   Text preprocessing — the step most PDF readers skip, and the
   main reason their narration sounds robotic and stilted.

   PDF text layers give you *visual lines*, not sentences. We must
   rebuild real sentences before handing anything to a TTS engine.
   ============================================================ */

import type { Lang } from '@/store/voiceStore';

export interface Paragraph {
  text: string;
  lang: Lang;
}

const BENGALI_RANGE = 'ঀ-৿';

/** Common ligatures / typographic characters pdf.js leaves in the stream. */
const LIGATURES: [RegExp, string][] = [
  [/ﬀ/g, 'ff'],
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  [/[\u00a0\u2007\u202f\u2009\u200a]/g, ' '], // no-break / thin spaces
  [/[‘’]/g, "'"], // curly single quotes
  [/[“”]/g, '"'], // curly double quotes
  [/[–—]/g, '—'], // en/em dash -> em dash
  [/…/g, '...'], // ellipsis
];

/** Raw text -> clean, sentence-joined text ready for SSML. */
export function preprocess(raw: string): string {
  let t = raw.normalize('NFC');

  for (const [re, rep] of LIGATURES) t = t.replace(re, rep);

  // de-hyphenate words broken across lines:  "atten-\ntion" -> "attention"
  t = t.replace(new RegExp(`([A-Za-z${BENGALI_RANGE}])-\\s*\\n\\s*([a-z${BENGALI_RANGE}])`, 'g'), '$1$2');

  // collapse single newlines *inside* a paragraph into spaces,
  // but keep blank-line paragraph breaks
  t = t.replace(/([^\n])\n(?!\n)/g, '$1 ');

  // strip footnote / reference superscript digits glued to a word end
  t = t.replace(new RegExp(`([a-z${BENGALI_RANGE}])\\d{1,2}(\\s|$)`, 'g'), '$1$2');

  // tidy whitespace
  t = t
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return t;
}

/** Split cleaned text into paragraphs, tagging each with a language. */
export function toParagraphs(cleaned: string, detect: (s: string) => Lang): Paragraph[] {
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => ({ text, lang: detect(text) }));
}

/** Split a paragraph into sentences for chunked, seekable playback. */
export function toSentences(paragraph: string): string[] {
  // '।' is the Bangla full stop (danda)
  return paragraph
    .split(new RegExp(`(?<=[।.!?])\\s+(?=[A-Z${BENGALI_RANGE}"'])`))
    .map((s) => s.trim())
    .filter(Boolean);
}

const XML_ESCAPE: [RegExp, string][] = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
];

function esc(s: string): string {
  let out = s;
  for (const [re, rep] of XML_ESCAPE) out = out.replace(re, rep);
  return out;
}

export interface SsmlOptions {
  voiceId: string;
  lang: Lang;
  rate: number; // 0.5-2.0
  pitch: number; // semitones, negative = calmer
  /** Azure express-as style; 'calm' / 'narration-professional' read as soothing */
  style?: string;
  paragraphGapMs: number;
}

/**
 * Build calm-sounding SSML for one paragraph:
 *  - slight rate reduction + lower pitch
 *  - gentle break after the paragraph
 *  - sentence-level <s> so the engine phrases naturally
 */
export function buildSsml(paragraph: string, o: SsmlOptions): string {
  const localeMap: Record<Lang, string> = { en: 'en-US', bn: 'bn-BD' };
  const locale = localeMap[o.lang];
  const sentences = toSentences(paragraph)
    .map((s) => `<s>${esc(s)}</s>`)
    .join('');

  const inner = `<prosody rate="${o.rate}" pitch="${o.pitch > 0 ? '+' : ''}${o.pitch}st">${sentences}<break time="${o.paragraphGapMs}ms"/></prosody>`;

  const styled = o.style
    ? `<mstts:express-as style="${o.style}">${inner}</mstts:express-as>`
    : inner;

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${o.voiceId}">${styled}</voice></speak>`;
}
