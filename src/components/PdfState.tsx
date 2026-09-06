import './pdfstate.css';

type Kind = 'loading' | 'error' | 'no-text' | 'empty-library' | 'tts-unavailable';

interface Props {
  kind: Kind;
  detail?: string;
  onRetry?: () => void;
  /** render as a slim banner inside the scroll area rather than a full panel */
  inline?: boolean;
}

const COPY: Record<Kind, { icon: string; title: string; body: string }> = {
  loading: { icon: '◠', title: 'Opening…', body: 'Rendering the document.' },
  error: {
    icon: '⚠',
    title: "Couldn't open this PDF",
    body: 'The file may be damaged or password-protected.',
  },
  'no-text': {
    icon: '⌇',
    title: 'No selectable text on this page',
    body: 'This looks like a scanned PDF. Reading it aloud needs OCR, which isn’t enabled yet.',
  },
  'empty-library': {
    icon: '＋',
    title: 'No documents yet',
    body: 'Open a PDF to start. It’s stored on this device and works offline.',
  },
  'tts-unavailable': {
    icon: '𝅘',
    title: 'No voice engine configured',
    body: 'Add an ElevenLabs or Azure key in settings, or playback uses the basic device voice.',
  },
};

export function PdfState({ kind, detail, onRetry, inline }: Props) {
  const c = COPY[kind];
  if (inline) {
    return (
      <div className="pdfstate-banner glass">
        <span className="pdfstate-banner-icon">{c.icon}</span>
        <span>{c.body}</span>
      </div>
    );
  }
  return (
    <div className={`pdfstate pdfstate-${kind}`}>
      <div className={`pdfstate-icon${kind === 'loading' ? ' spin' : ''}`}>{c.icon}</div>
      <h2>{c.title}</h2>
      <p>{detail || c.body}</p>
      {onRetry && (
        <button className="pdfstate-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
