import { useRef, useState, type PointerEvent } from 'react';
import type { SelectionRect } from '@/store/readerStore';
import { useReaderStore } from '@/store/readerStore';

interface Props {
  pageNumber: number;
  onSelect: (rect: SelectionRect) => void;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Handle = 'tl' | 'br' | null;

/**
 * Pick the passage to be read:
 *  - drag anywhere on the page to draw a box
 *  - once committed, drag the corner handles to adjust
 *  - a "Read this" chip confirms / a small ✕ clears
 * Coordinates are normalized 0–1 to the page so they survive zoom + rotation.
 */
export function SelectionOverlay({ pageNumber, onSelect }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const drawStart = useRef<{ x0: number; y0: number } | null>(null);
  const resizing = useRef<Handle>(null);

  const selection = useReaderStore((s) => s.selection);
  const setSelection = useReaderStore((s) => s.setSelection);
  const enterReadingMode = useReaderStore((s) => s.enterReadingMode);
  const readingMode = useReaderStore((s) => s.readingMode);
  const committed = selection?.page === pageNumber ? selection : null;

  const norm = (e: PointerEvent) => {
    const r = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const commit = (b: Box) => {
    const w = Math.abs(b.x1 - b.x0);
    const h = Math.abs(b.y1 - b.y0);
    if (w < 0.03 || h < 0.012) return;
    onSelect({
      page: pageNumber,
      x0: Math.min(b.x0, b.x1),
      y0: Math.min(b.y0, b.y1),
      x1: Math.max(b.x0, b.x1),
      y1: Math.max(b.y0, b.y1),
    });
  };

  // --- draw new box ---
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    if ((e.target as HTMLElement).closest('.pdf-select-handle, .pdf-select-chip')) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = norm(e);
    drawStart.current = { x0: p.x, y0: p.y };
    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = norm(e);
    if (resizing.current && committed) {
      const next: Box = { x0: committed.x0, y0: committed.y0, x1: committed.x1, y1: committed.y1 };
      if (resizing.current === 'tl') {
        next.x0 = p.x;
        next.y0 = p.y;
      } else {
        next.x1 = p.x;
        next.y1 = p.y;
      }
      setBox(next);
      return;
    }
    if (drawStart.current)
      setBox({ x0: drawStart.current.x0, y0: drawStart.current.y0, x1: p.x, y1: p.y });
  };

  const onPointerUp = () => {
    if (resizing.current && box) {
      commit(box);
      resizing.current = null;
      setBox(null);
      return;
    }
    if (drawStart.current && box) {
      commit(box);
      drawStart.current = null;
      setBox(null);
    }
  };

  const startResize = (which: Handle) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = which;
    if (committed) setBox({ x0: committed.x0, y0: committed.y0, x1: committed.x1, y1: committed.y1 });
  };

  const render = box ?? committed;
  const showCommittedChrome = Boolean(committed) && !box && !readingMode;

  return (
    <div
      ref={layerRef}
      className="pdf-select-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drawStart.current = null;
        resizing.current = null;
        setBox(null);
      }}
    >
      {render && (
        <div
          className={`pdf-select-box${showCommittedChrome ? ' committed' : ''}`}
          style={{
            left: `${Math.min(render.x0, render.x1) * 100}%`,
            top: `${Math.min(render.y0, render.y1) * 100}%`,
            width: `${Math.abs(render.x1 - render.x0) * 100}%`,
            height: `${Math.abs(render.y1 - render.y0) * 100}%`,
          }}
        >
          {showCommittedChrome && (
            <>
              <span
                className="pdf-select-handle tl"
                onPointerDown={startResize('tl')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
              <span
                className="pdf-select-handle br"
                onPointerDown={startResize('br')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
              <button
                className="pdf-select-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  enterReadingMode();
                }}
              >
                Read this
                <span
                  className="chip-x"
                  role="button"
                  aria-label="Clear selection"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelection(null);
                  }}
                >
                  ✕
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
