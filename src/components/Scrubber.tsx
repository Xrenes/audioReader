import { useRef, useState, type PointerEvent } from 'react';

interface Props {
  position: number;
  total: number;
  onSeek: (sec: number) => void;
  disabled?: boolean;
}

/** iPhone-style thin progress bar that thickens while scrubbing. */
export function Scrubber({ position, total, onSeek, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const pct = total > 0 ? Math.min(1, Math.max(0, (preview ?? position) / total)) : 0;

  const at = (e: PointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return x * total;
  };

  return (
    <div
      ref={trackRef}
      className={`scrubber${scrubbing ? ' scrubbing' : ''}${disabled ? ' disabled' : ''}`}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setScrubbing(true);
        setPreview(at(e));
      }}
      onPointerMove={(e) => scrubbing && setPreview(at(e))}
      onPointerUp={(e) => {
        if (!scrubbing) return;
        onSeek(at(e));
        setScrubbing(false);
        setPreview(null);
      }}
      onPointerCancel={() => {
        setScrubbing(false);
        setPreview(null);
      }}
    >
      <div className="scrubber-track">
        <div className="scrubber-fill" style={{ width: `${pct * 100}%` }} />
        <div className="scrubber-knob" style={{ left: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
