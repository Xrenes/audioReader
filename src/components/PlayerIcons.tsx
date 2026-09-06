/* Clean, consistent 24×24 stroke/fill icons for the audio player. */

export function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function PrevIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 5.5v13L9 12z" fill="currentColor" />
      <rect x="5" y="5" width="2.6" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5.5v13L15 12z" fill="currentColor" />
      <rect x="16.4" y="5" width="2.6" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

/** double chevron pointing left + a "5s" label */
export function Back5Icon() {
  return (
    <span className="tr-skip-inner">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M13 6l-6 6 6 6M19 6l-6 6 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="tr-skip-lbl">5s</span>
    </span>
  );
}

/** double chevron pointing right + a "5s" label */
export function Fwd5Icon() {
  return (
    <span className="tr-skip-inner">
      <span className="tr-skip-lbl">5s</span>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M11 6l6 6-6 6M5 6l6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
