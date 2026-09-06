/**
 * Lock-screen + headset transport controls, and — importantly on mobile —
 * keeping playback alive while the screen is off.
 *
 * Web Audio (the neural path) survives a screen lock if we (a) declare a
 * MediaSession, (b) keep a silent looping <audio> element playing, and
 * (c) resume the AudioContext on visibility changes.
 *
 * speechSynthesis (the device-voice fallback) is different: iOS and Android
 * both suspend it on lock and there is no reliable workaround — so for that
 * path we settle for auto-resuming when the screen comes back.
 */
export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  nextChunk: () => void;
  prevChunk: () => void;
  seekTo: (t: number) => void;
}

export function setupMediaSession(meta: { title: string; artist: string }, h: MediaSessionHandlers) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;

  ms.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: 'Audio Reader',
  });

  const set = (action: MediaSessionAction, fn: (d: MediaSessionActionDetails) => void) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* action unsupported on this platform */
    }
  };

  set('play', h.play);
  set('pause', h.pause);
  set('seekforward', () => h.skipForward());
  set('seekbackward', () => h.skipBackward());
  set('nexttrack', () => h.nextChunk());
  set('previoustrack', () => h.prevChunk());
  set('seekto', (d) => {
    if (typeof d.seekTime === 'number') h.seekTo(d.seekTime);
  });
}

export function updatePlaybackState(state: 'none' | 'paused' | 'playing') {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}

export function updatePositionState(durationSec: number, positionSec: number, rate = 1) {
  if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(0, durationSec),
      position: Math.max(0, Math.min(positionSec, durationSec)),
      playbackRate: rate,
    });
  } catch {
    /* invalid state, ignore */
  }
}

/* ---------------------------------------------------------------------------
   Background keep-alive
   --------------------------------------------------------------------------- */

let keepAlive: HTMLAudioElement | null = null;

/**
 * Start a silent looping <audio>. On mobile this holds the audio session open
 * so a Web Audio graph keeps running with the screen locked. Call from a user
 * gesture (the play tap).
 */
export function primeBackgroundAudio() {
  if (!keepAlive) {
    keepAlive = document.createElement('audio');
    keepAlive.loop = true;
    keepAlive.preload = 'auto';
    keepAlive.setAttribute('playsinline', '');
    keepAlive.setAttribute('aria-hidden', 'true');
    keepAlive.style.display = 'none';
    // ~1s of near-silence (longer loop = fewer wakeups than a 50ms clip)
    keepAlive.src =
      'data:audio/wav;base64,UklGRoQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YWAAAAA' +
      'A'.repeat(64);
    keepAlive.volume = 0.0001;
    // must be in the DOM for the audio session to hold on iOS
    document.body.appendChild(keepAlive);
  }
  void keepAlive.play().catch(() => {});
}

export function stopBackgroundAudio() {
  if (keepAlive) {
    keepAlive.pause();
    keepAlive.currentTime = 0;
  }
}

/**
 * Wire visibility / focus handling so playback recovers when the screen
 * returns. `onWake` is called when the page becomes visible again while a
 * session is meant to be playing — the caller decides whether to resume
 * (needed for the speechSynthesis path) or just un-suspend (Web Audio).
 */
export function watchVisibility(opts: {
  isPlaying: () => boolean;
  onWake: () => void;
  resumeAudioContext?: () => void;
}) {
  const handler = () => {
    if (document.visibilityState !== 'visible') return;
    opts.resumeAudioContext?.();
    if (opts.isPlaying()) {
      // nudge the keep-alive back on, then let the caller recover playback
      void keepAlive?.play().catch(() => {});
      opts.onWake();
    }
  };
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('focus', handler);
  window.addEventListener('pageshow', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('focus', handler);
    window.removeEventListener('pageshow', handler);
  };
}
