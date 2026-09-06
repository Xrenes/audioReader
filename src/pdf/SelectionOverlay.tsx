import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { SelectionRect } from '@/store/readerStore';
import { useReaderStore } from '@/store/readerStore';
import { usePlayerStore } from '@/store/playerStore';
import { anyVoiceAvailable } from '@/tts/availability';
import './rangemarker.css';

interface Props {
  pageNumber: number;
  onSelect: (rect: SelectionRect) => void;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Handle = 'tl' | 'br' | null;

const HOLD_MS = 550;
const DRAG_START = 8; // px of travel before we treat the gesture as a box-drag

/**
 * One overlay, two ways to pick a passage:
 *  - **drag** a box on a page  → single-region selection (handles + "Read this")
 *  - **press & hold** (~550ms, finger still) → drop a range marker; hold again
 *    elsewhere (even another page) for the end. PdfView shows "Read aloud".
 *
 * We do NOT capture the pointer until the gesture is clearly a drag, so a
 * plain touch still scrolls the page normally.
 */
export function SelectionOverlay({ pageNumber, onSelect }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  // gesture state
  const down = useRef<{ x: number; y: number; nx: number; ny: number; id: number } | null>(null);
  const mode = useRef<'idle' | 'draw' | 'resize'>('idle');
  const resizeHandle = useRef<Handle>(null);
  const holdTimer = useRef<number>(0);
  const holdFired = useRef(false);

  const selection = useReaderStore((s) => s.selection);
  const rangeStart = useReaderStore((s) => s.rangeStart);
  const rangeEnd = useReaderStore((s) => s.rangeEnd);
  const setSelection = useReaderStore((s) => s.setSelection);
  const setRangeStart = useReaderStore((s) => s.setRangeStart);
  const setRangeEnd = useReaderStore((s) => s.setRangeEnd);
  const requestPlay = useReaderStore((s) => s.requestPlay);
  const committed = selection?.page === pageNumber ? selection : null;

  const [voiceReady, setVoiceReady] = useState(true);
  useEffect(() => {
    if (committed) anyVoiceAvailable().then(setVoiceReady);
  }, [committed]);

  const norm = (clientX: number, clientY: number) => {
    const r = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
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

  const reset = () => {
    window.clearTimeout(holdTimer.current);
    down.current = null;
    mode.current = 'idle';
    resizeHandle.current = null;
    setBox(null);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    if ((e.target as HTMLElement).closest('.pdf-select-handle, .pdf-select-chip')) return;
    const n = norm(e.clientX, e.clientY);
    down.current = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y, id: e.pointerId };
    holdFired.current = false;
    mode.current = 'idle';

    // arm hold-to-mark only when there's no active box selection
    if (!selection) {
      holdTimer.current = window.setTimeout(() => {
        if (!down.current) return;
        holdFired.current = true;
        if (navigator.vibrate) navigator.vibrate(8);
        const { nx, ny } = down.current;
        if (!rangeStart || (rangeStart && rangeEnd)) {
          setRangeEnd(null);
          setRangeStart({ page: pageNumber, x: nx, y: ny });
        } else {
          setRangeEnd({ page: pageNumber, x: nx, y: ny });
        }
        down.current = null; // consumed; a following move won't draw a box
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!down.current || holdFired.current) return;
    const dx = e.clientX - down.current.x;
    const dy = e.clientY - down.current.y;
    const dist = Math.hypot(dx, dy);
    const p = norm(e.clientX, e.clientY);

    if (mode.current === 'idle') {
      if (dist < DRAG_START) return; // still might be a hold — let the browser scroll
      // it's a drag → cancel the hold, take over the gesture, start drawing
      window.clearTimeout(holdTimer.current);
      (e.target as HTMLElement).setPointerCapture(down.current.id);
      mode.current = 'draw';
      setBox({ x0: down.current.nx, y0: down.current.ny, x1: p.x, y1: p.y });
      return;
    }

    if (mode.current === 'draw') {
      setBox({ x0: down.current.nx, y0: down.current.ny, x1: p.x, y1: p.y });
    } else if (mode.current === 'resize' && committed) {
      const next: Box = { x0: committed.x0, y0: committed.y0, x1: committed.x1, y1: committed.y1 };
      if (resizeHandle.current === 'tl') {
        next.x0 = p.x;
        next.y0 = p.y;
      } else {
        next.x1 = p.x;
        next.y1 = p.y;
      }
      setBox(next);
    }
  };

  const onPointerUp = () => {
    window.clearTimeout(holdTimer.current);
    if (holdFired.current) {
      holdFired.current = false;
      down.current = null;
      mode.current = 'idle';
      return;
    }
    if ((mode.current === 'draw' || mode.current === 'resize') && box) commit(box);
    reset();
  };

  const startResize = (which: Handle) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, nx: 0, ny: 0, id: e.pointerId };
    mode.current = 'resize';
    resizeHandle.current = which;
    if (committed) setBox({ x0: committed.x0, y0: committed.y0, x1: committed.x1, y1: committed.y1 });
  };

  const status = usePlayerStore((s) => s.status);
  const busy = status === 'playing' || status === 'loading';

  const render = box ?? committed;
  const dragging = mode.current === 'draw' || mode.current === 'resize';
  const showChrome = Boolean(committed) && !dragging && !busy;

  const startHere = rangeStart?.page === pageNumber ? rangeStart : null;
  const endHere = rangeEnd?.page === pageNumber ? rangeEnd : null;

  return (
    <div
      ref={layerRef}
      className="pdf-select-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      {render && (
        <div
          className={`pdf-select-box${showChrome ? ' committed' : ''}${
            busy && committed && !dragging ? ' reading' : ''
          }`}
          style={{
            left: `${Math.min(render.x0, render.x1) * 100}%`,
            top: `${Math.min(render.y0, render.y1) * 100}%`,
            width: `${Math.abs(render.x1 - render.x0) * 100}%`,
            height: `${Math.abs(render.y1 - render.y0) * 100}%`,
          }}
        >
          {showChrome && (
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
                  if (voiceReady) requestPlay();
                  else useReaderStore.getState().setSheet('settings');
                }}
              >
                {voiceReady ? 'Read this' : 'Set up a voice'}
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

      {startHere && (
        <span
          className="range-pin range-pin-start"
          style={{ left: `${startHere.x * 100}%`, top: `${startHere.y * 100}%` }}
        >
          <span className="range-pin-dot" />
          <span className="range-pin-lbl">start</span>
        </span>
      )}
      {endHere && (
        <span
          className="range-pin range-pin-end"
          style={{ left: `${endHere.x * 100}%`, top: `${endHere.y * 100}%` }}
        >
          <span className="range-pin-dot" />
          <span className="range-pin-lbl">end</span>
        </span>
      )}
    </div>
  );
}
