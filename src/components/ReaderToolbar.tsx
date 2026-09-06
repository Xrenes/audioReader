import { useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import './readertoolbar.css';

/**
 * Floating glass toolbar over the PDF: zoom out / level / in, a page-number
 * field you can type into to jump, and a rotate button for reading sideways.
 */
export function ReaderToolbar() {
  const zoom = useReaderStore((s) => s.zoom);
  const rotation = useReaderStore((s) => s.rotation);
  const currentPage = useReaderStore((s) => s.currentPage);
  const numPages = useReaderStore((s) => s.numPages);
  const nudgeZoom = useReaderStore((s) => s.nudgeZoom);
  const resetZoom = useReaderStore((s) => s.resetZoom);
  const setPage = useReaderStore((s) => s.setPage);
  const rotate = useReaderStore((s) => s.rotate);

  const landscape = rotation === 90 || rotation === 270;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(currentPage));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, currentPage]);

  const commitPage = () => {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= numPages) {
      setPage(n);
      document
        .querySelector(`.pdf-page[data-page="${n}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setEditing(false);
  };

  const onRotate = async () => {
    rotate(1);
    const so = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    try {
      if (!landscape) await so.lock?.('landscape');
      else so.unlock?.();
    } catch {
      /* unsupported — CSS rotation still applies */
    }
  };

  return (
    <div className="rtoolbar glass-strong glass-lit">
      <button className="rtb-btn" onClick={() => nudgeZoom(-0.15)} aria-label="Zoom out">
        −
      </button>
      <button className="rtb-btn rtb-level" onClick={resetZoom} aria-label="Reset zoom">
        {Math.round(zoom * 100)}%
      </button>
      <button className="rtb-btn" onClick={() => nudgeZoom(0.15)} aria-label="Zoom in">
        +
      </button>

      <span className="rtb-sep" />

      {editing ? (
        <span className="rtb-page-edit">
          <input
            ref={inputRef}
            className="rtb-page-input"
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPage();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <span className="rtb-page-total">/&nbsp;{numPages}</span>
        </span>
      ) : (
        <button
          className="rtb-btn rtb-page"
          onClick={() => setEditing(true)}
          aria-label="Go to page"
          disabled={!numPages}
        >
          {currentPage}
          <span className="rtb-page-total">/&nbsp;{numPages || '—'}</span>
        </button>
      )}

      <span className="rtb-sep" />

      <button
        className={`rtb-btn rtb-rotate${landscape ? ' on' : ''}`}
        onClick={onRotate}
        aria-label="Rotate view"
        aria-pressed={landscape}
        title="Read sideways"
      >
        <RotateIcon />
      </button>
    </div>
  );
}

function RotateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9a8 8 0 0 1 13.5-3.5L20 8M20 4v4h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4" y="12" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
