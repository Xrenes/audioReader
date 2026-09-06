import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PdfTheme = 'light' | 'dark';
export type Sheet = null | 'pages' | 'settings';
/** 0 = normal, 90 = landscape (book held sideways) */
export type Rotation = 0 | 90 | 180 | 270;

export interface SelectionRect {
  page: number;
  /** normalized 0–1 coords within the page */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** a point on a page (normalized 0–1) — used for range start/end markers */
export interface PagePoint {
  page: number;
  x: number;
  y: number;
}

/** a visual line of the selected passage, for the on-page reading highlight */
export interface SelLine {
  /** which page this line is on (ranges span pages) */
  page: number;
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** one word of the passage + its page-space box — for the moving read marker */
export interface SelWord {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ReaderState {
  /** id of the loaded pdf in IndexedDB, null = library view */
  docId: string | null;
  docTitle: string;
  numPages: number;
  currentPage: number;
  zoom: number; // 1 = fit width
  rotation: Rotation;
  pdfTheme: PdfTheme;

  /** which bottom sheet / rail is open */
  sheet: Sheet;

  /** box selection (drag) — one region on one page */
  selection: SelectionRect | null;
  /** range markers (hold-to-mark) — can span pages */
  rangeStart: PagePoint | null;
  rangeEnd: PagePoint | null;

  /** extracted, preprocessed text for the active target (box OR range) */
  selectionText: string;
  /** per-line boxes of the passage, in reading order (for the trace) */
  selectionLines: SelLine[];
  /** per-word boxes, in reading order (for the moving read marker) */
  selectionWords: SelWord[];

  /** true once the user hits play and enters reading mode */
  readingMode: boolean;
  /** bumped by the "Start reading" chip — AudioBar watches it and (re)starts playback */
  playRequest: number;

  // --- actions ---
  openDoc: (id: string, title: string, numPages: number) => void;
  closeDoc: () => void;
  setPage: (p: number) => void;
  setZoom: (z: number) => void;
  nudgeZoom: (delta: number) => void;
  resetZoom: () => void;
  rotate: (dir?: 1 | -1) => void;
  togglePdfTheme: () => void;
  setSheet: (s: Sheet) => void;
  /** box selection */
  setSelection: (r: SelectionRect | null, text?: string, lines?: SelLine[], words?: SelWord[]) => void;
  /** range markers */
  setRangeStart: (p: PagePoint | null) => void;
  setRangeEnd: (p: PagePoint | null) => void;
  clearRange: () => void;
  /** fill the extracted text/lines for whichever target is active */
  setPassage: (text: string, lines: SelLine[], words: SelWord[]) => void;
  clearTarget: () => void;
  enterReadingMode: () => void;
  exitReadingMode: () => void;
  requestPlay: () => void;
}

const ZMIN = 0.5;
const ZMAX = 4;
const clampZoom = (z: number) => Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      docId: null,
      docTitle: '',
      numPages: 0,
      currentPage: 1,
      zoom: 1,
      rotation: 0,
      pdfTheme: 'light',
      sheet: null,
      selection: null,
      rangeStart: null,
      rangeEnd: null,
      selectionText: '',
      selectionLines: [],
      selectionWords: [],
      readingMode: false,
      playRequest: 0,

      openDoc: (docId, docTitle, numPages) =>
        set({
          docId,
          docTitle,
          numPages,
          currentPage: 1,
          selection: null,
          rangeStart: null,
          rangeEnd: null,
          selectionText: '',
          selectionLines: [],
          selectionWords: [],
        }),
      closeDoc: () =>
        set({
          docId: null,
          docTitle: '',
          numPages: 0,
          currentPage: 1,
          selection: null,
          rangeStart: null,
          rangeEnd: null,
          selectionText: '',
          selectionLines: [],
          selectionWords: [],
          readingMode: false,
          sheet: null,
          rotation: 0,
        }),
      setPage: (currentPage) => set({ currentPage }),
      setZoom: (z) => set({ zoom: clampZoom(z) }),
      nudgeZoom: (delta) => set((s) => ({ zoom: clampZoom(s.zoom + delta) })),
      resetZoom: () => set({ zoom: 1 }),
      rotate: (dir = 1) =>
        set((s) => ({ rotation: (((s.rotation + dir * 90) % 360) + 360) % 360 as Rotation })),
      togglePdfTheme: () => set((s) => ({ pdfTheme: s.pdfTheme === 'light' ? 'dark' : 'light' })),
      setSheet: (sheet) => set((s) => ({ sheet: s.sheet === sheet ? null : sheet })),
      setSelection: (selection, selectionText, selectionLines, selectionWords) =>
        set({
          selection,
          rangeStart: null,
          rangeEnd: null,
          selectionText: selectionText ?? '',
          selectionLines: selectionLines ?? [],
          selectionWords: selectionWords ?? [],
        }),
      setRangeStart: (rangeStart) =>
        set({
          rangeStart,
          selection: null,
          selectionText: '',
          selectionLines: [],
          selectionWords: [],
        }),
      setRangeEnd: (rangeEnd) => set({ rangeEnd }),
      clearRange: () =>
        set({
          rangeStart: null,
          rangeEnd: null,
          selectionText: '',
          selectionLines: [],
          selectionWords: [],
        }),
      setPassage: (selectionText, selectionLines, selectionWords) =>
        set({ selectionText, selectionLines, selectionWords }),
      clearTarget: () =>
        set({
          selection: null,
          rangeStart: null,
          rangeEnd: null,
          selectionText: '',
          selectionLines: [],
          selectionWords: [],
          readingMode: false,
        }),
      enterReadingMode: () => set({ readingMode: true }),
      exitReadingMode: () => set({ readingMode: false }),
      requestPlay: () => set((s) => ({ readingMode: true, playRequest: s.playRequest + 1 })),
    }),
    {
      name: 'audio-reader.reader',
      partialize: (s) => ({ pdfTheme: s.pdfTheme, zoom: s.zoom, rotation: s.rotation }),
    },
  ),
);
