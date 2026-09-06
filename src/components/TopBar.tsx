import { useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import './topbar.css';

/**
 * One aligned row across the top of the reader:
 *   ‹ back · ▤ pages · − zoom + · <page>/<n> · ⟳ rotate · ⚙ settings
 * A single glass bar — no separate floating buttons or centered pill.
 */
export function TopBar() {
  const closeDoc = useReaderStore((s) => s.closeDoc);
  const setSheet = useReaderStore((s) => s.setSheet);
  const sheet = useReaderStore((s) => s.sheet);

  const rotation = useReaderStore((s) => s.rotation);
  const currentPage = useReaderStore((s) => s.currentPage);
  const numPages = useReaderStore((s) => s.numPages);
  const nudgeZoom = useReaderStore((s) => s.nudgeZoom);
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
    <div className="topbar glass-strong glass-lit">
      <button className="tb-btn" onClick={closeDoc} aria-label="Library">
        <BackIcon />
      </button>
      <button
        className={`tb-btn${sheet === 'pages' ? ' on' : ''}`}
        onClick={() => setSheet('pages')}
        aria-label="Pages"
      >
        <PagesIcon />
      </button>

      <span className="tb-sep" />

      <button className="tb-btn" onClick={() => nudgeZoom(-0.15)} aria-label="Zoom out">
        −
      </button>
      <button className="tb-btn" onClick={() => nudgeZoom(0.15)} aria-label="Zoom in">
        +
      </button>

      {editing ? (
        <span className="tb-page-edit">
          <input
            ref={inputRef}
            className="tb-page-input"
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
          <span className="tb-page-total">/&nbsp;{numPages}</span>
        </span>
      ) : (
        <button
          className="tb-btn tb-page"
          onClick={() => setEditing(true)}
          aria-label="Go to page"
          disabled={!numPages}
        >
          {currentPage}
          <span className="tb-page-total">/&nbsp;{numPages || '—'}</span>
        </button>
      )}

      <button
        className={`tb-btn tb-rotate${landscape ? ' on' : ''}`}
        onClick={onRotate}
        aria-label="Rotate view"
        aria-pressed={landscape}
      >
        <RotateIcon />
      </button>

      <span className="tb-spacer" />

      <button
        className={`tb-btn${sheet === 'settings' ? ' on' : ''}`}
        onClick={() => setSheet('settings')}
        aria-label="Settings"
      >
        <SlidersIcon />
      </button>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PagesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function SlidersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h9M17 7h3M4 17h3M11 17h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="15" cy="7" r="2.3" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="17" r="2.3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
