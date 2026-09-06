import { useReaderStore } from '@/store/readerStore';
import './floatingcontrols.css';

/**
 * Floating round glass buttons over the PDF.
 *   left:  back to library · pages navigator
 *   right: settings
 * Brightness lives inside Settings, not here.
 */
export function FloatingControls() {
  const closeDoc = useReaderStore((s) => s.closeDoc);
  const setSheet = useReaderStore((s) => s.setSheet);
  const sheet = useReaderStore((s) => s.sheet);

  return (
    <div className="fctl">
      <div className="fctl-group fctl-left">
        <button className="fctl-btn" onClick={closeDoc} aria-label="Library">
          <BackIcon />
        </button>
        <button
          className={`fctl-btn${sheet === 'pages' ? ' on' : ''}`}
          onClick={() => setSheet('pages')}
          aria-label="Pages"
        >
          <PagesIcon />
        </button>
      </div>

      <div className="fctl-group fctl-right">
        <button
          className={`fctl-btn${sheet === 'settings' ? ' on' : ''}`}
          onClick={() => setSheet('settings')}
          aria-label="Settings"
        >
          <SlidersIcon />
        </button>
      </div>
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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
