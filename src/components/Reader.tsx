import { useReaderStore } from '@/store/readerStore';
import { PdfView } from '@/pdf/PdfView';
import { FloatingControls } from './FloatingControls';
import { GlassSheet } from './GlassSheet';
import { Thumbnails } from '@/pdf/Thumbnails';
import { VoiceSettings } from './VoiceSettings';
import { AudioBar } from './AudioBar';
import './reader.css';

export function Reader() {
  const sheet = useReaderStore((s) => s.sheet);
  const setSheet = useReaderStore((s) => s.setSheet);

  return (
    <div className="reader">
      <FloatingControls />

      <div className="reader-body">
        <main className="reader-center">
          <PdfView />
        </main>
      </div>

      {/* page navigator — hidden until the Pages button is tapped */}
      <GlassSheet open={sheet === 'pages'} onClose={() => setSheet('pages')} title="Pages" side="left">
        <PagesPanel />
      </GlassSheet>

      {/* everything else lives here */}
      <GlassSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('settings')}
        title="Settings"
        side="right"
      >
        <VoiceSettings />
      </GlassSheet>

      <AudioBar />
    </div>
  );
}

function PagesPanel() {
  const current = useReaderStore((s) => s.currentPage);
  const total = useReaderStore((s) => s.numPages);
  return (
    <div className="pages-panel">
      <div className="pages-panel-head">
        <span className="pages-panel-count">
          Page <b>{current}</b> of {total || '—'}
        </span>
      </div>
      <Thumbnails orientation="grid" />
    </div>
  );
}
