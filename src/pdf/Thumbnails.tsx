import { useEffect, useRef, useState } from 'react';
import { loadDocument, type PDFDocumentProxy } from './pdfSetup';
import { useReaderStore } from '@/store/readerStore';
import { loadPdf } from '@/storage/db';
import './thumbnails.css';

/**
 * Left rail (desktop) / bottom sheet strip (mobile).
 * Scrolls in sync with the main view: the active page auto-centers here,
 * and tapping a thumbnail jumps the main view via a shared scroll intent.
 */
export function Thumbnails({
  orientation = 'vertical',
}: {
  orientation?: 'vertical' | 'horizontal' | 'grid';
}) {
  const docId = useReaderStore((s) => s.docId);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setPage = useReaderStore((s) => s.setPage);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!docId) return;
    (async () => {
      const rec = await loadPdf(docId);
      if (!rec || cancelled) return;
      setDoc(await loadDocument(rec.bytes));
    })();
    return () => {
      cancelled = true;
      setDoc(null);
    };
  }, [docId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [currentPage]);

  const jump = (n: number) => {
    setPage(n);
    document
      .querySelector(`.pdf-page[data-page="${n}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!doc) return <div className="thumbs-empty">…</div>;

  return (
    <div ref={railRef} className={`thumbs thumbs-${orientation}`}>
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          ref={n === currentPage ? activeRef : undefined}
          className={`thumb${n === currentPage ? ' active' : ''}`}
          onClick={() => jump(n)}
        >
          <ThumbCanvas doc={doc} pageNumber={n} />
          <span className="thumb-num">{n}</span>
        </button>
      ))}
    </div>
  );
}

function ThumbCanvas({ doc, pageNumber }: { doc: PDFDocumentProxy; pageNumber: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), {
      rootMargin: '400px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen) return;
    let cancelled = false;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled || !ref.current) return;
      const target = 120;
      const vp1 = page.getViewport({ scale: 1 });
      const scale = target / vp1.width;
      const vp = page.getViewport({ scale });
      const c = ref.current;
      c.width = vp.width;
      c.height = vp.height;
      page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
    });
    return () => {
      cancelled = true;
    };
  }, [seen, doc, pageNumber]);

  return (
    <div ref={wrapRef} className="thumb-canvas-wrap">
      <canvas ref={ref} className="thumb-canvas" />
    </div>
  );
}
