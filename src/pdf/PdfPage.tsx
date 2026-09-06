import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { PDFDocumentProxy } from './pdfSetup';
import { useReaderStore } from '@/store/readerStore';

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** width budget for the page's *un-rotated* wide edge */
  targetWidth: number;
  scrollRoot: RefObject<HTMLElement>;
  children?: ReactNode;
}

/**
 * One page. Renders its canvas only while near the viewport, keeps a
 * correctly-sized placeholder so scroll position is stable, and honours
 * the store's `rotation` by baking it into the pd.js viewport — so a
 * rotated page is genuinely landscape and the layout flows normally
 * (no CSS transform hacks, and the selection overlay stays aligned).
 */
export function PdfPage({ doc, pageNumber, targetWidth, scrollRoot, children }: Props) {
  const rotation = useReaderStore((s) => s.rotation);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // measure displayed size for the current rotation
  useEffect(() => {
    let cancelled = false;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1, rotation });
      const scale = targetWidth / vp.width;
      setSize({ w: targetWidth, h: vp.height * scale });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, targetWidth, rotation]);

  useEffect(() => {
    const el = wrapRef.current;
    const root = scrollRoot.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root,
      rootMargin: '1200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!visible || !size) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const base = page.getViewport({ scale: 1, rotation });
      const scale = (size.w / base.width) * dpr;
      const viewport = page.getViewport({ scale, rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      const ctx = canvas.getContext('2d')!;
      task = page.render({ canvasContext: ctx, viewport });
      (task as unknown as { promise: Promise<void> }).promise?.catch(() => {});
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, size, doc, pageNumber, rotation]);

  return (
    <div
      ref={wrapRef}
      className="pdf-page"
      style={{ width: size?.w, height: size?.h }}
      data-page={pageNumber}
    >
      {visible && <canvas ref={canvasRef} className="pdf-canvas" />}
      <div className="pdf-page-number">{pageNumber}</div>
      {visible && children}
    </div>
  );
}
