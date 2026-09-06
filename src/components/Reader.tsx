import { useEffect } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { PdfView } from '@/pdf/PdfView';
import { TopBar } from './TopBar';
import { GlassSheet } from './GlassSheet';
import { Thumbnails } from '@/pdf/Thumbnails';
import { VoiceSettings } from './VoiceSettings';
import { AudioBar } from './AudioBar';
import { SetupSheet } from './SetupSheet';
import { useVoiceStore } from '@/store/voiceStore';
import './reader.css';

export function Reader() {
  const sheet = useReaderStore((s) => s.sheet);
  const setSheet = useReaderStore((s) => s.setSheet);
  const selection = useReaderStore((s) => s.selection);
  const readingMode = useReaderStore((s) => s.readingMode);
  const configured = useVoiceStore((s) => s.configured);

  // On first-ever selection, if the user hasn't set up voices, nudge the setup sheet.
  useEffect(() => {
    if (selection && !configured) setSheet('settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  return (
    <div className="reader">
      <TopBar />

      <div className="reader-body">
        {/* desktop left rail */}
        <aside className="rail rail-left glass">
          <Thumbnails orientation="vertical" />
        </aside>

        <main className="reader-center">
          <PdfView />
        </main>

        {/* desktop right rail */}
        <aside className="rail rail-right glass">
          {readingMode || configured ? <VoiceSettings /> : <SetupSheet inline />}
        </aside>
      </div>

      {/* mobile bottom sheets */}
      <GlassSheet open={sheet === 'pages'} onClose={() => setSheet('pages')} title="Pages" side="left">
        <Thumbnails orientation="horizontal" />
      </GlassSheet>

      <GlassSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('settings')}
        title={configured ? 'Reading settings' : 'Set up voices'}
        side="right"
      >
        {configured ? <VoiceSettings /> : <SetupSheet />}
      </GlassSheet>

      <AudioBar />
    </div>
  );
}
