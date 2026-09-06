import { useEffect, useRef } from 'react';
import { useReadingSession } from '@/audio/useReadingSession';
import { usePlayerStore } from '@/store/playerStore';
import { useReaderStore } from '@/store/readerStore';
import { useVoiceStore } from '@/store/voiceStore';
import { Scrubber } from './Scrubber';
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  Back5Icon,
  Fwd5Icon,
} from './PlayerIcons';
import './audiobar.css';

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/**
 * The audio player — a single compact glass bar (no full-screen mode).
 * Scrubber, transport, speed and the voice switch all live here.
 */
export function AudioBar() {
  const { start, toggle, skip, seek, seekChunk, applySpeed } = useReadingSession();

  const status = usePlayerStore((s) => s.status);
  const position = usePlayerStore((s) => s.position);
  const total = usePlayerStore((s) => s.totalDuration);
  const error = usePlayerStore((s) => s.error);

  const selection = useReaderStore((s) => s.selection);
  const selectionText = useReaderStore((s) => s.selectionText);
  const currentPage = useReaderStore((s) => s.currentPage);
  const playRequest = useReaderStore((s) => s.playRequest);
  const hasTarget = Boolean(selection || selectionText);

  // "Read this" chip bumps playRequest → start reading that passage now
  const lastReq = useRef(0);
  useEffect(() => {
    if (playRequest > lastReq.current) {
      lastReq.current = playRequest;
      void start();
    }
  }, [playRequest, start]);

  // double-tap on the page (while reading) toggles play/pause
  useEffect(() => {
    const h = () => toggle();
    window.addEventListener('audioreader:toggle', h);
    return () => window.removeEventListener('audioreader:toggle', h);
  }, [toggle]);
  const activeSlot = useVoiceStore((s) => s.activeSlot);
  const setActiveSlot = useVoiceStore((s) => s.setActiveSlot);
  const rate = useVoiceStore((s) => s.voices[activeSlot].rate);
  const pitch = useVoiceStore((s) => s.voices[activeSlot].pitch);
  const setActiveRate = useVoiceStore((s) => s.setActiveRate);
  const nameA = useVoiceStore((s) => s.voices.A.namedVoiceId);
  const nameB = useVoiceStore((s) => s.voices.B.namedVoiceId);
  const label = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

  // show the player once playback exists for a range, or a box is picked
  const active = status !== 'idle' || selection;
  if (!hasTarget || !active) return null;

  const playing = status === 'playing';
  const loading = status === 'loading';

  return (
    <div className="audiobar-root">
      <div className="audiobar glass-strong glass-lit">
        <div className="audiobar-topline">
          <span className="audiobar-title">{loading ? 'Preparing…' : `Reading · p.${currentPage}`}</span>
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

        <Scrubber position={position} total={total} onSeek={seek} disabled={total === 0} />

        <div className="audiobar-times">
          <span>{fmt(position)}</span>
          <span>{total ? `-${fmt(total - position)}` : '--:--'}</span>
        </div>

        <div className="audiobar-transport">
          <button onClick={() => seekChunk(-1)} aria-label="Previous sentence" className="tr-btn">
            <PrevIcon />
          </button>
          <button onClick={() => skip(-5)} aria-label="Back 5 seconds" className="tr-btn tr-skip">
            <Back5Icon />
          </button>
          <button onClick={toggle} className="tr-btn tr-play" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={() => skip(5)} aria-label="Forward 5 seconds" className="tr-btn tr-skip">
            <Fwd5Icon />
          </button>
          <button onClick={() => seekChunk(1)} aria-label="Next sentence" className="tr-btn">
            <NextIcon />
          </button>
        </div>

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

        {error && <div className="audiobar-error">{error}</div>}
      </div>
    </div>
  );
}
