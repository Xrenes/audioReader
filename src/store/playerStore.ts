import { create } from 'zustand';
import type { VoiceSlot } from './voiceStore';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/** One spoken unit (sentence / paragraph) on the timeline */
export interface Chunk {
  id: string;
  text: string;
  lang: 'en' | 'bn';
  slot: VoiceSlot;
  /** seconds, filled once audio is generated */
  start: number;
  duration: number;
}

interface PlayerState {
  status: PlaybackStatus;
  /** whole-timeline position in seconds */
  position: number;
  totalDuration: number;
  chunks: Chunk[];
  currentChunkId: string | null;
  error: string | null;

  setStatus: (s: PlaybackStatus) => void;
  setPosition: (t: number) => void;
  setTimeline: (chunks: Chunk[], total: number) => void;
  setCurrentChunk: (id: string | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  status: 'idle',
  position: 0,
  totalDuration: 0,
  chunks: [],
  currentChunkId: null,
  error: null,

  setStatus: (status) => set({ status }),
  setPosition: (position) => set({ position }),
  setTimeline: (chunks, totalDuration) => set({ chunks, totalDuration }),
  setCurrentChunk: (currentChunkId) => set({ currentChunkId }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  reset: () =>
    set({
      status: 'idle',
      position: 0,
      totalDuration: 0,
      chunks: [],
      currentChunkId: null,
      error: null,
    }),
}));
