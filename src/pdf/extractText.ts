import type { PDFDocumentProxy, PDFPageProxy } from './pdfSetup';
import type { SelectionRect, PagePoint, SelLine, SelWord } from '@/store/readerStore';
import { preprocess } from '@/tts/preprocess';

interface Item {
  str: string;
  /** page-space bbox, origin top-left, normalized 0–1 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  hasEOL: boolean;
}

/**
 * Pull the text items on a page and normalize their positions (0–1, origin
 * top-left) in the SAME rotated space the selection rectangle is drawn in,
 * so the two can be intersected directly regardless of `rotation`.
 */
export async function getPageItems(page: PDFPageProxy, rotation = 0): Promise<Item[]> {
  const viewport = page.getViewport({ scale: 1, rotation });
  const content = await page.getTextContent();
  const { width, height } = viewport;

  const items: Item[] = [];
  for (const it of content.items) {
    if (!('str' in it)) continue;
    const t = it.transform; // [a, b, c, d, e, f] in unrotated PDF space
    const x = t[4];
    const yBottom = t[5];
    const w = it.width;
    const h = it.height || Math.hypot(t[2], t[3]) || 10;

    // map the item's four-ish extent into rotated *viewport* pixels
    const p1 = viewport.convertToViewportPoint(x, yBottom); // baseline start
    const p2 = viewport.convertToViewportPoint(x + w, yBottom + h); // opposite corner
    const vx0 = Math.min(p1[0], p2[0]);
    const vx1 = Math.max(p1[0], p2[0]);
    const vy0 = Math.min(p1[1], p2[1]);
    const vy1 = Math.max(p1[1], p2[1]);

    items.push({
      str: it.str,
      x0: vx0 / width,
      y0: vy0 / height,
      x1: vx1 / width,
      y1: vy1 / height,
      hasEOL: (it as { hasEOL?: boolean }).hasEOL ?? false,
    });
  }
  return items;
}

/** Does an item's box overlap the selection box (both normalized)? */
function intersects(it: Item, r: SelectionRect): boolean {
  const rx0 = Math.min(r.x0, r.x1);
  const rx1 = Math.max(r.x0, r.x1);
  const ry0 = Math.min(r.y0, r.y1);
  const ry1 = Math.max(r.y0, r.y1);
  // require the vertical center of the line to be inside the band,
  // and some horizontal overlap
  const cy = (it.y0 + it.y1) / 2;
  const hOverlap = it.x1 > rx0 && it.x0 < rx1;
  return cy >= ry0 && cy <= ry1 && hOverlap;
}

export interface SelectionExtract {
  /** preprocessed, sentence-joined text for TTS */
  text: string;
  /** the visual lines it came from, in reading order, for the reading trace */
  lines: SelLine[];
  /** per-word boxes in reading order, for the moving read marker */
  words: SelWord[];
}

/** split a line's items into per-word boxes (approx: divide item width by char count) */
function wordsFromItems(items: Item[], pageNo: number): SelWord[] {
  const out: SelWord[] = [];
  for (const it of items) {
    const parts = it.str.split(/(\s+)/); // keep whitespace tokens for offsetting
    const totalChars = it.str.length || 1;
    const w = it.x1 - it.x0;
    let charAcc = 0;
    for (const part of parts) {
      const len = part.length;
      if (part.trim()) {
        const x0 = it.x0 + (charAcc / totalChars) * w;
        const x1 = it.x0 + ((charAcc + len) / totalChars) * w;
        out.push({ page: pageNo, x0, y0: it.y0, x1, y1: it.y1 });
      }
      charAcc += len;
    }
  }
  return out;
}

/** group page items into visual lines, top→bottom, items left→right */
function toLineGroups(items: Item[]): Item[][] {
  const groups: Item[][] = [];
  const sorted = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const tol = 0.012;
  for (const it of sorted) {
    const line = groups.find((l) => Math.abs(l[0].y0 - it.y0) < tol);
    if (line) line.push(it);
    else groups.push([it]);
  }
  for (const g of groups) g.sort((a, b) => a.x0 - b.x0);
  return groups;
}

function linesFromGroups(groups: Item[][], pageNo: number): SelLine[] {
  return groups.map((ordered) => {
    let s = '';
    for (let i = 0; i < ordered.length; i++) {
      s += ordered[i].str;
      const next = ordered[i + 1];
      if (next && next.x0 - ordered[i].x1 > 0.006 && !s.endsWith(' ')) s += ' ';
    }
    return {
      page: pageNo,
      text: s.trim(),
      x0: Math.min(...ordered.map((o) => o.x0)),
      x1: Math.max(...ordered.map((o) => o.x1)),
      y0: Math.min(...ordered.map((o) => o.y0)),
      y1: Math.max(...ordered.map((o) => o.y1)),
    };
  });
}

/** all visual lines + words of a page, in reading order */
async function pageContent(
  page: PDFPageProxy,
  pageNo: number,
  rotation: number,
): Promise<{ lines: SelLine[]; words: SelWord[] }> {
  const items = (await getPageItems(page, rotation)).filter((it) => it.str.trim());
  const groups = toLineGroups(items);
  return {
    lines: linesFromGroups(groups, pageNo),
    words: groups.flatMap((g) => wordsFromItems(g, pageNo)),
  };
}

/**
 * Extract text under a drag-box selection in natural reading order, plus
 * per-line and per-word bounding boxes.
 */
export async function extractSelection(
  page: PDFPageProxy,
  rect: SelectionRect,
  rotation = 0,
): Promise<SelectionExtract> {
  const items = (await getPageItems(page, rotation)).filter(
    (it) => it.str.trim() && intersects(it, rect),
  );
  const groups = toLineGroups(items);
  const lines = linesFromGroups(groups, rect.page);
  const words = groups.flatMap((g) => wordsFromItems(g, rect.page));

  return {
    text: preprocess(lines.map((l) => l.text).join('\n')),
    lines,
    words,
  };
}

/** Cap on how many pages a hold-to-mark range may span. */
export const MAX_RANGE_PAGES = 20;

/**
 * Extract text for a hold-to-mark range: from `start` on its page, through
 * every page up to `end`, stopping at `end` on the last page. Returns the
 * joined text plus per-line boxes (each carrying its page number).
 */
export async function extractRange(
  doc: PDFDocumentProxy,
  start: PagePoint,
  end: PagePoint,
  rotation = 0,
): Promise<SelectionExtract & { truncated: boolean }> {
  // order the two points
  let a = start;
  let b = end;
  if (a.page > b.page || (a.page === b.page && a.y > b.y)) [a, b] = [b, a];

  const truncated = b.page - a.page + 1 > MAX_RANGE_PAGES;
  const lastPage = Math.min(b.page, a.page + MAX_RANGE_PAGES - 1);

  const lines: SelLine[] = [];
  const words: SelWord[] = [];
  for (let p = a.page; p <= lastPage; p++) {
    const { lines: lns, words: wds } = await pageContent(await doc.getPage(p), p, rotation);
    const inRange = (cy: number) => {
      if (p === a.page && cy < a.y - 0.01) return false;
      if (p === lastPage && p === b.page && cy > b.y + 0.01) return false;
      return true;
    };
    for (const l of lns) if (inRange((l.y0 + l.y1) / 2)) lines.push(l);
    for (const w of wds) if (inRange((w.y0 + w.y1) / 2)) words.push(w);
  }

  return {
    text: preprocess(lines.map((l) => l.text).join('\n')),
    lines,
    words,
    truncated,
  };
}

/** Whole-page text (for "read to end of page / document" scopes). */
export async function extractPage(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let raw = '';
  for (const it of content.items) {
    if (!('str' in it)) continue;
    raw += it.str;
    if ((it as { hasEOL?: boolean }).hasEOL) raw += '\n';
    else if (!raw.endsWith(' ')) raw += ' ';
  }
  return preprocess(raw);
}

