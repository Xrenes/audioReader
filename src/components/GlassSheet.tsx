import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';
import './glasssheet.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 'bottom' = sheet up from the bottom; 'left' = drawer in from the left edge */
  side?: 'bottom' | 'left' | 'right';
  /** no header / grip / padding — just the children (used for the narrow page rail) */
  bare?: boolean;
  children: ReactNode;
}

/**
 * Frosted-black panel. `side="left"` is a drawer that slides in from the left
 * edge (page navigator, like a normal PDF reader); anything else is a bottom
 * sheet with a drag-down-to-dismiss grip.
 */
export function GlassSheet({ open, onClose, title, side = 'bottom', bare = false, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ from: number; d: number } | null>(null);
  const isLeft = side === 'left';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // drag-down-to-dismiss for the bottom sheet only
  const onPointerDown = (e: PointerEvent) => {
    drag.current = { from: e.clientY, d: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const d = Math.max(0, e.clientY - drag.current.from);
    drag.current.d = d;
    sheetRef.current.style.transform = `translateY(${d}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !sheetRef.current) return;
    const { d } = drag.current;
    sheetRef.current.style.transform = '';
    drag.current = null;
    if (d > 110) onClose();
  };

  return (
    <div
      className={`sheet-root sheet-${side}${open ? ' open' : ''}${bare ? ' sheet-bare' : ''}`}
      aria-hidden={!open}
    >
      <div className="sheet-scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet glass-strong glass-lit"
        role="dialog"
        aria-label={title ?? 'Panel'}
      >
        {!isLeft && !bare && (
          <div
            className="sheet-grip"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <span className="sheet-grip-bar" />
          </div>
        )}
        {!bare && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="sheet-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
