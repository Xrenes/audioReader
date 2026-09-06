import { useCallback, useEffect, useRef } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useVoiceStore } from '@/store/voiceStore';
import { usePlayerStore, type Chunk } from '@/store/playerStore';
import { AudioReaderPlayer, decodeAudio, type LoadedChunk } from './player';
import {
  setupMediaSession,
  updatePlaybackState,
  updatePositionState,
  primeBackgroundAudio,
  stopBackgroundAudio,
  watchVisibility,
} from './mediaSession';
import { toParagraphs, toSentences, buildSsml } from '@/tts/preprocess';
import { detectLang } from '@/tts/detectLang';
import { voiceManager } from '@/tts/voiceManager';
import { getEngine, engineAvailable } from '@/tts/registry';
import { BrowserSpeaker, setBrowserSpeakerParams, type SpeakChunk } from './browserSpeaker';
import { getCachedAudio, putCachedAudio, audioCacheKey, pruneAudioCache } from '@/storage/db';
import type { Lang, VoiceSlot } from '@/store/voiceStore';

/**
 * Orchestrates a reading session:
 *   selected text → paragraphs → sentences → (cache | Azure) → decoded buffers
 *   → AudioReaderPlayer timeline → transport.
 *
 * Generate-then-play: we synth the whole scope up front so ±5 min seek and a
 * real scrubber work. A live voice switch re-synths only the remaining chunks.
 */
export function useReadingSession() {
  const player = useRef<AudioReaderPlayer | null>(null);
  const speaker = useRef<BrowserSpeaker | null>(null);
  /** true while the current session is running on the speechSynthesis fallback */
  const onFallback = useRef(false);
  const genToken = useRef(0);

  const setStatus = usePlayerStore((s) => s.setStatus);
  const setTimeline = usePlayerStore((s) => s.setTimeline);
  const setPosition = usePlayerStore((s) => s.setPosition);
  const setCurrentChunk = usePlayerStore((s) => s.setCurrentChunk);
  const setError = usePlayerStore((s) => s.setError);

  // --- lazily create the player ---
  const getPlayer = useCallback(() => {
    if (!player.current) {
      player.current = new AudioReaderPlayer({
        onTick: (t) => {
          setPosition(t);
          const st = usePlayerStore.getState();
          updatePositionState(st.totalDuration, t);
        },
        onChunkChange: (id) => setCurrentChunk(id),
        onEnded: () => {
          setStatus('ended');
          updatePlaybackState('paused');
          stopBackgroundAudio();
        },
      });
    }
    return player.current;
  }, [setPosition, setCurrentChunk, setStatus]);

  useEffect(() => {
    // recover playback when the screen / tab comes back
    const unwatch = watchVisibility({
      isPlaying: () => usePlayerStore.getState().status === 'playing',
      resumeAudioContext: () => {
        if (!onFallback.current) player.current?.wake();
      },
      onWake: () => {
        if (onFallback.current) {
          // speechSynthesis was likely suspended by the OS on lock — kick it
          speaker.current?.recover();
        }
      },
    });
    return () => {
      unwatch();
      player.current?.dispose();
      player.current = null;
      speaker.current?.stop();
      speaker.current = null;
      stopBackgroundAudio();
    };
  }, []);

  const getSpeaker = useCallback(() => {
    if (!speaker.current) {
      speaker.current = new BrowserSpeaker({
        onChunk: (id) => setCurrentChunk(id),
        onProgress: (sec, total) => {
          setPosition(sec);
          usePlayerStore.getState().setTimeline(usePlayerStore.getState().chunks, total);
        },
        onDone: () => {
          setStatus('ended');
          updatePlaybackState('paused');
        },
        onError: (msg) => setError(msg),
      });
    }
    return speaker.current;
  }, [setCurrentChunk, setPosition, setStatus, setError]);

  /** Build the chunk list (text + slot + lang) from current stores. */
  const planChunks = useCallback((): Chunk[] => {
    const { selectionText } = useReaderStore.getState();
    const { activeSlot, alternating, languageMode } = useVoiceStore.getState();
    if (!selectionText.trim()) return [];

    const detect = (s: string): Lang => (languageMode === 'auto' ? detectLang(s) : languageMode);
    const paragraphs = toParagraphs(selectionText, detect);

    const chunks: Chunk[] = [];
    let pIdx = 0;
    for (const p of paragraphs) {
      const slot: VoiceSlot = alternating ? (pIdx % 2 === 0 ? activeSlot : other(activeSlot)) : activeSlot;
      for (const sentence of toSentences(p.text)) {
        chunks.push({
          id: `c${chunks.length}`,
          text: sentence,
          lang: p.lang,
          slot,
          start: 0,
          duration: 0,
        });
      }
      // mark paragraph boundary on the last chunk via a trailing flag in id
      if (chunks.length) chunks[chunks.length - 1].id += ':pend';
      pIdx++;
    }
    return chunks;
  }, []);

  /** Synthesize one chunk, using the on-device cache when possible. */
  const synthChunk = useCallback(async (chunk: Chunk, signal: AbortSignal) => {
    const { voices, paragraphGapMs } = useVoiceStore.getState();
    const cfg = voices[chunk.slot];

    // "Ahmed" / "Akter"  ->  real provider voice for this language
    const resolved = voiceManager.resolve(cfg.namedVoiceId, chunk.lang);
    const voiceId = resolved.providerVoiceId;

    const cacheKey = await audioCacheKey({
      text: chunk.text,
      voiceId: `${resolved.provider}:${voiceId}`,
      rate: cfg.rate,
      pitch: cfg.pitch,
    });
    const cached = await getCachedAudio(cacheKey);
    if (cached && cached.audio.byteLength) {
      return { audio: cached.audio, gapAfter: 0 };
    }

    const engine = getEngine(resolved.provider);
    if (!(await engine.available())) {
      // caller handles the no-buffer browser fallback path
      return { audio: new ArrayBuffer(0), gapAfter: 0 };
    }

    // SSML only matters to Azure; ElevenLabs ignores it and uses req.text
    const ssml = buildSsml(chunk.text, {
      voiceId,
      lang: chunk.lang,
      rate: cfg.rate,
      pitch: cfg.pitch,
      style: resolved.provider === 'azure' && chunk.lang === 'en' ? 'calm' : undefined,
      paragraphGapMs,
    });

    const res = await engine.synth(
      {
        ssml,
        text: chunk.text,
        voiceId,
        lang: chunk.lang,
        rate: cfg.rate,
        pitch: cfg.pitch,
        modelId: resolved.modelId,
        settings: resolved.settings,
      },
      signal,
    );
    await putCachedAudio({
      key: cacheKey,
      audio: res.audio,
      mime: res.mime,
      durationSec: res.durationSec,
    });
    return { audio: res.audio, gapAfter: 0 };
  }, []);

  /** Full generate → load → play. */
  const start = useCallback(async () => {
    const token = ++genToken.current;
    const chunks = planChunks();
    if (!chunks.length) return;

    setStatus('loading');
    setError(null);
    primeBackgroundAudio();

    // Which providers do the planned chunks actually need?
    const neededProviders = new Set(
      chunks.map((c) => {
        const { voices } = useVoiceStore.getState();
        return voiceManager.resolve(voices[c.slot].namedVoiceId, c.lang).provider;
      }),
    );
    const anyRealEngine = (
      await Promise.all([...neededProviders].map((p) => engineAvailable(p)))
    ).some(Boolean);

    if (!anyRealEngine) {
      // --- device-voice fallback (speechSynthesis) ---
      if (!BrowserSpeaker.supported()) {
        setError('No speech engine available on this device.');
        return;
      }
      onFallback.current = true;
      player.current?.stop();

      const { voices, activeSlot, deviceVoiceUri } = useVoiceStore.getState();
      const activeCfg = voices[activeSlot];
      // feed the managed speaker the live speed/pitch + chosen system voice
      setBrowserSpeakerParams(activeCfg.rate, activeCfg.pitch);

      const speakChunks: SpeakChunk[] = chunks.map((c) => {
        const cfg = voices[c.slot];
        return { id: c.id, text: c.text, lang: c.lang, rate: cfg.rate, pitch: cfg.pitch };
      });

      const sp = getSpeaker();
      // prefer the user's picked voice for the dominant language, else auto-best
      const domLang = speakChunks.some((c) => c.lang === 'bn') ? 'bn' : 'en';
      sp.setVoiceURI(deviceVoiceUri[domLang]);
      await sp.load(speakChunks);
      // show a coherent (estimated) timeline for the scrubber
      setTimeline(
        chunks.map((c) => ({ ...c, start: 0, duration: 0 })),
        sp.estTotalSec,
      );
      const { docTitle } = useReaderStore.getState();
      setupMediaSession(
        { title: docTitle || 'Passage', artist: 'Audio Reader (device voice)' },
        {
          play: () => {
            sp.resume();
            setStatus('playing');
          },
          pause: () => {
            sp.pause();
            setStatus('paused');
          },
          skipForward: () => {},
          skipBackward: () => {},
          nextChunk: () => {},
          prevChunk: () => {},
          seekTo: () => {},
        },
      );
      await sp.play();
      setStatus('playing');
      updatePlaybackState('playing');
      return;
    }

    onFallback.current = false;

    try {
      const { paragraphGapMs, crossfadeMs, fadeEdgesMs } = useVoiceStore.getState();
      const loaded: LoadedChunk[] = [];
      const meta: Chunk[] = [];
      let acc = 0;

      for (const c of chunks) {
        if (genToken.current !== token) return;
        const { audio } = await synthChunk(c, new AbortController().signal);
        const buffer = await decodeAudio(audio);
        const isParaEnd = c.id.endsWith(':pend');
        const gapAfter = isParaEnd ? paragraphGapMs / 1000 : 0.06;
        loaded.push({ id: c.id, buffer, gapAfter });
        meta.push({ ...c, start: acc, duration: buffer.duration });
        acc += buffer.duration + gapAfter;

        // stream the timeline in as it builds so playback can start early
        if (loaded.length === 1) {
          const p = getPlayer();
          p.crossfadeMs = crossfadeMs;
          p.fadeEdgesMs = fadeEdgesMs;
        }
      }

      if (genToken.current !== token) return;

      const p = getPlayer();
      p.crossfadeMs = crossfadeMs;
      p.fadeEdgesMs = fadeEdgesMs;
      p.setTimeline(loaded);
      setTimeline(meta, acc);

      const { docTitle } = useReaderStore.getState();
      setupMediaSession(
        { title: docTitle || 'Passage', artist: 'Audio Reader' },
        {
          play: () => {
            void p.play();
            setStatus('playing');
            updatePlaybackState('playing');
          },
          pause: () => {
            p.pause();
            setStatus('paused');
            updatePlaybackState('paused');
          },
          skipForward: () => p.skip(300),
          skipBackward: () => p.skip(-300),
          nextChunk: () => p.seekChunk(1),
          prevChunk: () => p.seekChunk(-1),
          seekTo: (t) => p.seek(t),
        },
      );

      await p.play();
      setStatus('playing');
      updatePlaybackState('playing');
      void pruneAudioCache();
    } catch (e) {
      if (genToken.current === token) setError((e as Error).message);
    }
  }, [planChunks, synthChunk, getPlayer, getSpeaker, setStatus, setError, setTimeline]);

  const resume = useCallback(async () => {
    primeBackgroundAudio();
    if (onFallback.current) {
      getSpeaker().resume();
    } else {
      await getPlayer().play();
    }
    setStatus('playing');
    updatePlaybackState('playing');
  }, [getPlayer, getSpeaker, setStatus]);

  const pause = useCallback(() => {
    if (onFallback.current) getSpeaker().pause();
    else getPlayer().pause();
    setStatus('paused');
    updatePlaybackState('paused');
    stopBackgroundAudio();
  }, [getPlayer, getSpeaker, setStatus]);

  const toggle = useCallback(() => {
    const st = usePlayerStore.getState().status;
    if (st === 'idle' || st === 'ended' || st === 'error') return start();
    if (st === 'playing') return pause();
    return resume();
  }, [start, pause, resume]);

  const skip = useCallback(
    (sec: number) => {
      if (onFallback.current) getSpeaker().seekBySeconds(sec);
      else getPlayer().skip(sec);
    },
    [getPlayer, getSpeaker],
  );
  const seek = useCallback(
    (sec: number) => {
      if (onFallback.current) getSpeaker().seekToSeconds(sec);
      else getPlayer().seek(sec);
    },
    [getPlayer, getSpeaker],
  );
  const seekChunk = useCallback(
    (dir: -1 | 1) => {
      if (onFallback.current) getSpeaker().skipSentence(dir);
      else getPlayer().seekChunk(dir);
    },
    [getPlayer, getSpeaker],
  );

  /** Speed changed while playing — make it take effect now. */
  const applySpeed = useCallback(
    (rate: number, pitch: number) => {
      setBrowserSpeakerParams(rate, pitch);
      if (onFallback.current) getSpeaker().applyRate();
      // (neural path applies rate on the next chunk; live re-pitch would need re-synth)
    },
    [getSpeaker],
  );

  /** Re-synth the not-yet-played chunks with whatever voice settings are current. */
  const applyVoiceChangeFromHere = useCallback(async () => {
    const p = getPlayer();
    const pos = p.position;
    const wasPlaying = p.isPlaying;
    p.pause();
    await start(); // regenerates; simple + correct. Optimize later to splice.
    if (!wasPlaying) p.pause();
    p.seek(pos);
  }, [getPlayer, start]);

  return { start, toggle, pause, resume, skip, seek, seekChunk, applySpeed, applyVoiceChangeFromHere };
}

function other(s: VoiceSlot): VoiceSlot {
  return s === 'A' ? 'B' : 'A';
}
