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

const HOLD_MS = 2000; // press-and-hold to arm range mode
const DRAG_START = 8; // px of travel before a plain drag becomes a box
const DBL_MS = 320; // double-tap window
const DBL_SLOP = 24; // px between the two taps of a double-tap

/**
 * Passage selection on touch:
 *  - **quick drag** → box (single region, "Read this")
 *  - **hold 2s (finger still) → then drag** → sweep a range across the page
 *  - **double-tap a word** → set range start / end (works across pages)
 *  - **double-tap a blank area** → play / pause
 *
 * Any touch with two or more fingers is ignored so pinch-zoom works.
 */
export function SelectionOverlay({ pageNumber, onSelect }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  const down = useRef<{ x: number; y: number; nx: number; ny: number; id: number } | null>(null);
  const mode = useRef<'idle' | 'draw' | 'resize' | 'range'>('idle');
  const resizeHandle = useRef<Handle>(null);
  const holdTimer = useRef<number>(0);
  const armed = useRef(false); // range mode armed by the 2s hold
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  const selection = useReaderStore((s) => s.selection);
  const rangeStart = useReaderStore((s) => s.rangeStart);
  const rangeEnd = useReaderStore((s) => s.rangeEnd);
  const setSelection = useReaderStore((s) => s.setSelection);
  const setRangeStart = useReaderStore((s) => s.setRangeStart);
  const setRangeEnd = useReaderStore((s) => s.setRangeEnd);
  const requestPlay = useReaderStore((s) => s.requestPlay);
  const committed = selection?.page === pageNumber ? selection : null;

  const status = usePlayerStore((s) => s.status);
  const busy = status === 'playing' || status === 'loading';

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

  const commitBox = (b: Box) => {
    if (Math.abs(b.x1 - b.x0) < 0.03 || Math.abs(b.y1 - b.y0) < 0.012) return;
    onSelect({
      page: pageNumber,
      x0: Math.min(b.x0, b.x1),
      y0: Math.min(b.y0, b.y1),
      x1: Math.max(b.x0, b.x1),
      y1: Math.max(b.y0, b.y1),
    });
  };

  const dropRangePoint = (nx: number, ny: number) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeEnd(null);
      setRangeStart({ page: pageNumber, x: nx, y: ny });
    } else {
      setRangeEnd({ page: pageNumber, x: nx, y: ny });
    }
  };

  const reset = () => {
    window.clearTimeout(holdTimer.current);
    down.current = null;
    mode.current = 'idle';
    resizeHandle.current = null;
    armed.current = false;
    setBox(null);
  };

  const onPointerDown = (e: PointerEvent) => {
    // ignore multi-touch entirely — let the browser pinch-zoom
    if (e.pointerType === 'touch' && !e.isPrimary) {
      reset();
      return;
    }
    if ((e.target as HTMLElement).closest('.pdf-select-handle, .pdf-select-chip')) return;

    const n = norm(e.clientX, e.clientY);
    down.current = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y, id: e.pointerId };
    mode.current = 'idle';
    armed.current = false;

    if (!selection) {
      // 2s hold → arm range mode (finger stays down; a later drag sweeps it)
      holdTimer.current = window.setTimeout(() => {
        if (!down.current) return;
        armed.current = true;
        if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
        (e.target as HTMLElement).setPointerCapture?.(down.current.id);
        // drop the start point right away; the drag will place the end
        const { nx, ny } = down.current;
        setRangeStart({ page: pageNumber, x: nx, y: ny });
        setRangeEnd(null);
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!down.current) return;
    const dx = e.clientX - down.current.x;
    const dy = e.clientY - down.current.y;
    const dist = Math.hypot(dx, dy);
    const p = norm(e.clientX, e.clientY);

    if (armed.current) {
      // range sweep — track the end point
      mode.current = 'range';
      setRangeEnd({ page: pageNumber, x: p.x, y: p.y });
      e.preventDefault();
      return;
    }

    if (mode.current === 'idle') {
      if (dist < DRAG_START) return; // maybe still a hold — don't hijack scroll
      window.clearTimeout(holdTimer.current); // moved → not a hold
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

  const onPointerUp = (e: PointerEvent) => {
    window.clearTimeout(holdTimer.current);

    // range sweep finished
    if (mode.current === 'range') {
      reset();
      return;
    }
    // armed but never dragged → the start point is already dropped; just end
    if (armed.current) {
      armed.current = false;
      down.current = null;
      mode.current = 'idle';
      return;
    }

    if ((mode.current === 'draw' || mode.current === 'resize') && box) {
      commitBox(box);
      reset();
      return;
    }

    // no drag happened → treat as a tap; check for double-tap
    const now = Date.now();
    const prev = lastTap.current;
    const near =
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DBL_SLOP && now - prev.t < DBL_MS;
    if (near) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      handleDoubleTap(e);
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
    reset();
  };

  const handleDoubleTap = (e: PointerEvent) => {
    // reading → double-tap anywhere toggles play/pause
    if (busy || status === 'paused' || status === 'ended') {
      window.dispatchEvent(new CustomEvent('audioreader:toggle'));
      return;
    }
    // not reading, no box selection → double-tap sets a range point
    if (!selection) {
      const n = norm(e.clientX, e.clientY);
      dropRangePoint(n.x, n.y);
    }
  };

  const startResize = (which: Handle) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, nx: 0, ny: 0, id: e.pointerId };
    mode.current = 'resize';
    resizeHandle.current = which;
    if (committed) setBox({ x0: committed.x0, y0: committed.y0, x1: committed.x1, y1: committed.y1 });
  };

  const render = box ?? committed;
  const dragging = mode.current === 'draw' || mode.current === 'resize';
  const showChrome = Boolean(committed) && !dragging && !busy;

  const startHere = rangeStart?.page === pageNumber ? rangeStart : null;
  const endHere = rangeEnd?.page === pageNumber ? rangeEnd : null;
  const bandHere =
    rangeStart && rangeEnd && rangeStart.page === pageNumber && rangeEnd.page === pageNumber
      ? {
          y0: Math.min(rangeStart.y, rangeEnd.y),
          y1: Math.max(rangeStart.y, rangeEnd.y),
        }
      : null;

  return (
    <div
      ref={layerRef}
      className="pdf-select-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      {armed.current && !render && <div className="range-armed-hint">drag to sweep the range</div>}

      {bandHere && (
        <div
          className="range-band"
          style={{ top: `${bandHere.y0 * 100}%`, height: `${(bandHere.y1 - bandHere.y0) * 100}%` }}
        />
      )}

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
