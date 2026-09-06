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

  /** the passage the user picked to be read */
  selection: SelectionRect | null;
  /** extracted, preprocessed text for that selection */
  selectionText: string;

  /** true once the user hits play and enters reading mode */
  readingMode: boolean;

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
  setSelection: (r: SelectionRect | null, text?: string) => void;
  enterReadingMode: () => void;
  exitReadingMode: () => void;
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
      selectionText: '',
      readingMode: false,

      openDoc: (docId, docTitle, numPages) =>
        set({ docId, docTitle, numPages, currentPage: 1, selection: null, selectionText: '' }),
      closeDoc: () =>
        set({
          docId: null,
          docTitle: '',
          numPages: 0,
          currentPage: 1,
          selection: null,
          selectionText: '',
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
      setSelection: (selection, selectionText) =>
        set({ selection, selectionText: selectionText ?? '' }),
      enterReadingMode: () => set({ readingMode: true }),
      exitReadingMode: () => set({ readingMode: false }),
    }),
    {
      name: 'audio-reader.reader',
      partialize: (s) => ({ pdfTheme: s.pdfTheme, zoom: s.zoom, rotation: s.rotation }),
    },
  ),
);
