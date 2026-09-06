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

      {/* page navigator — narrow left rail, thumbnails only */}
      <GlassSheet open={sheet === 'pages'} onClose={() => setSheet('pages')} side="left" bare>
        <Thumbnails orientation="vertical" />
      </GlassSheet>

      {/* everything else lives here */}
      <GlassSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('settings')}
        title="Settings"
        side="bottom"
      >
        <VoiceSettings />
      </GlassSheet>

      <AudioBar />
    </div>
  );
}
