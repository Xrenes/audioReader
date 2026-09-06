import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';
import './glasssheet.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  children: ReactNode;
}

/**
 * Bottom sheet for mobile. Frosted black, rounded top, drag-down to dismiss.
 * On desktop these are hidden (the rails take over via CSS).
 */
export function GlassSheet({ open, onClose, title, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { y0: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !sheetRef.current) return;
    const { dy } = drag.current;
    sheetRef.current.style.transform = '';
    drag.current = null;
    if (dy > 110) onClose();
  };

  return (
    <div className={`sheet-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={sheetRef} className="sheet glass-strong glass-lit" role="dialog" aria-label={title}>
        <div
          className="sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="sheet-grip-bar" />
        </div>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
