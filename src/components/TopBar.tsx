import { useReaderStore } from '@/store/readerStore';

export function TopBar() {
  const title = useReaderStore((s) => s.docTitle);
  const current = useReaderStore((s) => s.currentPage);
  const total = useReaderStore((s) => s.numPages);
  const pdfTheme = useReaderStore((s) => s.pdfTheme);
  const togglePdfTheme = useReaderStore((s) => s.togglePdfTheme);
  const closeDoc = useReaderStore((s) => s.closeDoc);
  const setSheet = useReaderStore((s) => s.setSheet);

  return (
    <header className="topbar glass glass-lit">
      <button className="topbar-btn" onClick={closeDoc} aria-label="Library">
        ‹
      </button>

      <div className="topbar-center">
        <span className="topbar-title">{title}</span>
        <span className="topbar-page">
          {current} / {total || '—'}
        </span>
      </div>

      <button
        className="topbar-btn"
        onClick={togglePdfTheme}
        aria-label="Toggle page theme"
        title="Page light / dark"
      >
        {pdfTheme === 'light' ? '☀' : '☾'}
      </button>

      {/* mobile-only quick access to sheets */}
      <button
        className="topbar-btn topbar-mobile"
        onClick={() => setSheet('pages')}
        aria-label="Pages"
      >
        ▤
      </button>
      <button
        className="topbar-btn topbar-mobile"
        onClick={() => setSheet('settings')}
        aria-label="Settings"
      >
        ⚙
      </button>
    </header>
  );
}
