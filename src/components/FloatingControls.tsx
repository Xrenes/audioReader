import { useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import './floatingcontrols.css';

/**
 * Small round glass buttons floating over the PDF instead of a top bar.
 *  left:  back to library · dark / bright toggle
 *  right: pages navigator · settings
 * They dim and shrink slightly while the page is being scrolled.
 */
export function FloatingControls() {
  const closeDoc = useReaderStore((s) => s.closeDoc);
  const pdfTheme = useReaderStore((s) => s.pdfTheme);
  const togglePdfTheme = useReaderStore((s) => s.togglePdfTheme);
  const setSheet = useReaderStore((s) => s.setSheet);
  const sheet = useReaderStore((s) => s.sheet);

  const [idle, setIdle] = useState(false);
  const t = useRef<number>(0);

  useEffect(() => {
    const scroller = document.querySelector('.pdf-scroll');
    if (!scroller) return;
    const onScroll = () => {
      setIdle(true);
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setIdle(false), 900);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  });

  return (
    <div className={`fctl${idle ? ' idle' : ''}`}>
      <div className="fctl-group fctl-left">
        <button className="fctl-btn" onClick={closeDoc} aria-label="Library">
          ‹
        </button>
        <button
          className="fctl-btn"
          onClick={togglePdfTheme}
          aria-label="Toggle page brightness"
          title={pdfTheme === 'light' ? 'Switch to dark page' : 'Switch to light page'}
        >
          {pdfTheme === 'light' ? '☾' : '☀'}
        </button>
      </div>

      <div className="fctl-group fctl-right">
        <button
          className={`fctl-btn${sheet === 'pages' ? ' on' : ''}`}
          onClick={() => setSheet('pages')}
          aria-label="Pages"
        >
          <PagesIcon />
        </button>
        <button
          className={`fctl-btn${sheet === 'settings' ? ' on' : ''}`}
          onClick={() => setSheet('settings')}
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}

function PagesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="14" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="14" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
