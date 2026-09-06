import { useEffect, useRef, useState, useCallback } from 'react';
import { loadDocument, type PDFDocumentProxy } from './pdfSetup';
import { PdfPage } from './PdfPage';
import { useReaderStore } from '@/store/readerStore';
import { loadPdf } from '@/storage/db';
import { extractSelection, extractRange, MAX_RANGE_PAGES } from './extractText';
import { SelectionOverlay } from './SelectionOverlay';
import { ReaderToolbar } from '@/components/ReaderToolbar';
import { PdfState } from '@/components/PdfState';
import { usePinchZoom } from './usePinchZoom';
import { anyVoiceAvailable } from '@/tts/availability';
import type { SelectionRect } from '@/store/readerStore';
import './pdf.css';
import './rangemarker.css';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Continuously-scrolling PDF surface. Lazily renders pages, reports the
 * page nearest the viewport centre, supports pinch-zoom, rotate-to-landscape,
 * a drag-box selection AND a hold-to-mark range (which can span pages).
 */
export function PdfView() {
  const docId = useReaderStore((s) => s.docId);
  const zoom = useReaderStore((s) => s.zoom);
  const rotation = useReaderStore((s) => s.rotation);
  const pdfTheme = useReaderStore((s) => s.pdfTheme);
  const setPage = useReaderStore((s) => s.setPage);
  const setSelection = useReaderStore((s) => s.setSelection);

  const rangeStart = useReaderStore((s) => s.rangeStart);
  const rangeEnd = useReaderStore((s) => s.rangeEnd);
  const setPassage = useReaderStore((s) => s.setPassage);
  const clearRange = useReaderStore((s) => s.clearRange);
  const clearTarget = useReaderStore((s) => s.clearTarget);
  const requestPlay = useReaderStore((s) => s.requestPlay);
  const setSheet = useReaderStore((s) => s.setSheet);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [hasTextLayer, setHasTextLayer] = useState<boolean | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [voiceReady, setVoiceReady] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());

  usePinchZoom(scrollRef);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoadState('loading');
    setErrMsg('');
    setHasTextLayer(null);
    try {
      const rec = await loadPdf(docId);
      if (!rec) throw new Error('This document is no longer in your library.');
      const d = await loadDocument(rec.bytes);
      setDoc(d);
      setLoadState('ready');
      const probe = Math.min(2, d.numPages);
      let chars = 0;
      for (let i = 1; i <= probe; i++) {
        const tc = await (await d.getPage(i)).getTextContent();
        chars += tc.items.reduce((n, it) => n + ('str' in it ? it.str.length : 0), 0);
      }
      setHasTextLayer(chars > 20);
    } catch (e) {
      setErrMsg((e as Error).message || 'Could not open this PDF.');
      setLoadState('error');
    }
  }, [docId]);

  useEffect(() => {
    load();
    return () => setDoc(null);
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [loadState]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let best = 1;
    let bestDist = Infinity;
    pageEls.current.forEach((node, n) => {
      const center = node.offsetTop + node.offsetHeight / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    });
    setPage(best);
  }, [setPage]);

  const handleSelection = useCallback(
    async (rect: SelectionRect) => {
      if (!doc) return;
      const page = await doc.getPage(rect.page);
      const { text, lines, words } = await extractSelection(page, rect, rotation);
      setSelection(rect, text, lines, words);
    },
    [doc, setSelection, rotation],
  );

  // both range markers placed -> extract the multi-page passage
  useEffect(() => {
    if (!doc || !rangeStart || !rangeEnd) return;
    let cancelled = false;
    setRangeBusy(true);
    (async () => {
      const { text, lines, words, truncated } = await extractRange(doc, rangeStart, rangeEnd, rotation);
      if (cancelled) return;
      setRangeTruncated(truncated);
      setPassage(text, lines, words);
      setRangeBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, rangeStart, rangeEnd, rotation, setPassage]);

  useEffect(() => {
    if (rangeStart && rangeEnd) anyVoiceAvailable().then(setVoiceReady);
  }, [rangeStart, rangeEnd]);

  if (!docId) return null;

  const rangeComplete = Boolean(rangeStart && rangeEnd);

  return (
    <div className="pdf-viewport">
      <ReaderToolbar />

      {loadState === 'loading' && <PdfState kind="loading" />}
      {loadState === 'error' && <PdfState kind="error" detail={errMsg} onRetry={load} />}

      {loadState === 'ready' && doc && (
        <div
          className="pdf-scroll"
          data-rotation={rotation}
          ref={scrollRef}
          onScroll={onScroll}
          data-pdf-theme={pdfTheme}
        >
          {hasTextLayer === false && <PdfState kind="no-text" inline />}

          {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className="pdf-page-slot"
              ref={(el) => {
                if (el) pageEls.current.set(n, el);
                else pageEls.current.delete(n);
              }}
            >
              <PdfPage
                doc={doc}
                pageNumber={n}
                targetWidth={Math.max(280, containerWidth * zoom - 24)}
                scrollRoot={scrollRef}
              >
                <SelectionOverlay pageNumber={n} onSelect={handleSelection} />
              </PdfPage>
            </div>
          ))}
        </div>
      )}

      {/* range hint / start bar */}
      {rangeStart && !rangeEnd && (
        <div className="range-bar">
          <span>Now hold where the reading should end</span>
          <button onClick={clearRange}>Clear</button>
        </div>
      )}
      {rangeComplete && rangeStart && rangeEnd && (
        <div className="range-bar range-bar-ready">
          <button
            className="range-start-btn"
            disabled={rangeBusy}
            onClick={() => {
              if (voiceReady) requestPlay();
              else setSheet('settings');
            }}
          >
            {rangeBusy ? 'Preparing…' : voiceReady ? 'Read aloud' : 'Set up a voice'}
          </button>
          <span className="range-note">
            {rangeTruncated
              ? `first ${MAX_RANGE_PAGES} pages`
              : `p.${Math.min(rangeStart.page, rangeEnd.page)}–${Math.max(
                  rangeStart.page,
                  rangeEnd.page,
                )}`}
          </span>
          <button className="range-clear" onClick={clearTarget}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
