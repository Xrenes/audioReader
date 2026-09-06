import { useReadingSession } from '@/audio/useReadingSession';
import { usePlayerStore } from '@/store/playerStore';
import { useReaderStore } from '@/store/readerStore';
import { useVoiceStore } from '@/store/voiceStore';
import { Scrubber } from './Scrubber';
import './audiobar.css';

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/**
 * Glassmorphic iPhone-style player. Collapsed = mini bar pinned above the
 * safe-area. Tap the body to expand to the full-screen player.
 */
export function AudioBar() {
  const { toggle, skip, seek, seekChunk, applySpeed } = useReadingSession();

  const status = usePlayerStore((s) => s.status);
  const position = usePlayerStore((s) => s.position);
  const total = usePlayerStore((s) => s.totalDuration);
  const expanded = usePlayerStore((s) => s.expanded);
  const setExpanded = usePlayerStore((s) => s.setExpanded);
  const error = usePlayerStore((s) => s.error);

  const selection = useReaderStore((s) => s.selection);
  const currentPage = useReaderStore((s) => s.currentPage);
  const activeSlot = useVoiceStore((s) => s.activeSlot);
  const setActiveSlot = useVoiceStore((s) => s.setActiveSlot);
  const rate = useVoiceStore((s) => s.voices[activeSlot].rate);
  const pitch = useVoiceStore((s) => s.voices[activeSlot].pitch);
  const setActiveRate = useVoiceStore((s) => s.setActiveRate);
  const nameA = useVoiceStore((s) => s.voices.A.namedVoiceId);
  const nameB = useVoiceStore((s) => s.voices.B.namedVoiceId);
  const label = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
  const activeName = label(activeSlot === 'A' ? nameA : nameB);

  if (!selection) return null;

  const playing = status === 'playing';
  const loading = status === 'loading';
  const playLabel = loading ? '…' : playing ? '❚❚' : '▶';

  return (
    <div className={`audiobar-root${expanded ? ' expanded' : ''}`}>
      {expanded && <div className="audiobar-scrim" onClick={() => setExpanded(false)} />}

      <div className={`audiobar glass-strong glass-lit${expanded ? ' full' : ''}`}>
        {expanded && (
          <button className="audiobar-collapse" onClick={() => setExpanded(false)} aria-label="Minimize">
            ⌄
          </button>
        )}

        {expanded && (
          <div className="audiobar-hero">
            <div className="audiobar-page-badge">Page {selection.page}</div>
            <div className="audiobar-voiceswitch">
              <button
                className={`vsw${activeSlot === 'A' ? ' on vsw-a' : ''}`}
                onClick={() => setActiveSlot('A')}
              >
                {label(nameA)}
              </button>
              <button
                className={`vsw${activeSlot === 'B' ? ' on vsw-b' : ''}`}
                onClick={() => setActiveSlot('B')}
              >
                {label(nameB)}
              </button>
            </div>
          </div>
        )}

        <div className="audiobar-body" onClick={() => !expanded && setExpanded(true)}>
          {!expanded && (
            <div className="audiobar-mini-meta">
              <span className="audiobar-mini-title">
                {loading ? 'Preparing…' : 'Reading'} · p.{currentPage}
              </span>
              <span className="audiobar-mini-sub">
                {activeName} · {rate.toFixed(2)}×
              </span>
            </div>
          )}

          <Scrubber
            position={position}
            total={total}
            onSeek={seek}
            disabled={total === 0}
          />

          <div className="audiobar-times">
            <span>{fmt(position)}</span>
            <span>{total ? `-${fmt(total - position)}` : '--:--'}</span>
          </div>

          <div className="audiobar-transport">
            <button onClick={() => seekChunk(-1)} aria-label="Previous paragraph" className="tr-btn">
              ⏮
            </button>
            <button onClick={() => skip(-300)} aria-label="Back 5 minutes" className="tr-btn tr-skip">
              <span className="tr-skip-num">5</span>↺
            </button>
            <button onClick={toggle} className="tr-btn tr-play" aria-label="Play / pause">
              {playLabel}
            </button>
            <button onClick={() => skip(300)} aria-label="Forward 5 minutes" className="tr-btn tr-skip">
              ↻<span className="tr-skip-num">5</span>
            </button>
            <button onClick={() => seekChunk(1)} aria-label="Next paragraph" className="tr-btn">
              ⏭
            </button>
          </div>

          <div className="audiobar-speed" onClick={(e) => e.stopPropagation()}>
            <div className="audiobar-speed-steps">
              {[0.7, 0.85, 1, 1.15, 1.3].map((v) => (
                <button
                  key={v}
                  className={`spd${Math.abs(rate - v) < 0.03 ? ' on' : ''}`}
                  onClick={() => {
                    setActiveRate(v);
                    applySpeed(v, pitch);
                  }}
                >
                  {v === 1 ? '1×' : `${v.toFixed(2).replace(/0$/, '')}×`}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="audiobar-error" onClick={(e) => e.stopPropagation()}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
