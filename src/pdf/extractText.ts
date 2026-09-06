import type { PDFPageProxy } from './pdfSetup';
import type { SelectionRect } from '@/store/readerStore';
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

/**
 * Extract text under a selection rectangle in natural reading order,
 * then run it through the "not robotic" preprocessing pipeline.
 */
export async function extractSelection(
  page: PDFPageProxy,
  rect: SelectionRect,
  rotation = 0,
): Promise<string> {
  const items = (await getPageItems(page, rotation)).filter(
    (it) => it.str.trim() && intersects(it, rect),
  );

  // group into lines by y, then order lines top→bottom, items left→right
  const lines: Item[][] = [];
  const sorted = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const tol = 0.012; // ~1.2% of page height
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y0 - it.y0) < tol);
    if (line) line.push(it);
    else lines.push([it]);
  }

  const raw = lines
    .map((line) => {
      const ordered = line.sort((a, b) => a.x0 - b.x0);
      let s = '';
      for (let i = 0; i < ordered.length; i++) {
        s += ordered[i].str;
        const next = ordered[i + 1];
        if (next && next.x0 - ordered[i].x1 > 0.006 && !s.endsWith(' ')) s += ' ';
      }
      return s.trim();
    })
    .join('\n');

  return preprocess(raw);
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
