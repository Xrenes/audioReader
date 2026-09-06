import { useReaderStore } from '@/store/readerStore';
import './readertoolbar.css';

/**
 * Floating glass toolbar over the PDF: zoom out / level / in / fit,
 * and a rotate button to read a book held sideways (landscape).
 * Where the browser allows it we also lock the screen orientation.
 */
export function ReaderToolbar() {
  const zoom = useReaderStore((s) => s.zoom);
  const rotation = useReaderStore((s) => s.rotation);
  const nudgeZoom = useReaderStore((s) => s.nudgeZoom);
  const resetZoom = useReaderStore((s) => s.resetZoom);
  const rotate = useReaderStore((s) => s.rotate);

  const landscape = rotation === 90 || rotation === 270;

  const onRotate = async () => {
    rotate(1);
    // best-effort native orientation lock (Android/Chrome installed PWA)
    const so = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    try {
      if (!landscape) await so.lock?.('landscape');
      else so.unlock?.();
    } catch {
      /* not permitted / unsupported — CSS rotation still applies */
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
