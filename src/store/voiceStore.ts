import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { voiceManager } from '@/tts/voiceManager';

export type Lang = 'en' | 'bn';
export type ReadingScope = 'selection' | 'toPageEnd' | 'toDocEnd';
export type VoiceSlot = 'A' | 'B';

/**
 * A slot points at a *named voice* (Ahmed / Akter). The real provider
 * voice id is resolved per-language by voiceManager from voices.json.
 * rate / pitch are user playback controls.
 */
export interface SlotConfig {
  namedVoiceId: string;
  rate: number; // 0.5 – 1.5
  pitch: number; // -8 – +4 semitones (negative = calmer)
}

interface VoiceState {
  voices: Record<VoiceSlot, SlotConfig>;
  activeSlot: VoiceSlot;
  /** Alternate A / B by paragraph for a dialogue feel */
  alternating: boolean;

  languageMode: 'auto' | Lang;
  scope: ReadingScope;

  /** which system voice the device-voice fallback should use (voiceURI), per language.
   *  null = auto-pick the most natural-sounding available. */
  deviceVoiceUri: Record<Lang, string | null>;

  /** peaceful-playback options */
  paragraphGapMs: number;
  crossfadeMs: number;
  fadeEdgesMs: number;
  ambientBed: 'off' | 'rain' | 'brown';
  ambientLevel: number;

  configured: boolean;

  // --- actions ---
  setSlotVoice: (slot: VoiceSlot, namedVoiceId: string) => void;
  setSlotParam: (slot: VoiceSlot, patch: Partial<Pick<SlotConfig, 'rate' | 'pitch'>>) => void;
  /** convenience: set speed on the currently active slot (player speed control) */
  setActiveRate: (rate: number) => void;
  setActiveSlot: (slot: VoiceSlot) => void;
  toggleAlternating: () => void;
  setLanguageMode: (m: 'auto' | Lang) => void;
  setScope: (s: ReadingScope) => void;
  setDeviceVoice: (lang: Lang, uri: string | null) => void;
  patch: (p: Partial<VoiceState>) => void;
  markConfigured: () => void;
}

const slots = voiceManager.defaultSlotIds();
const clampRate = (r: number) => Math.min(1.5, Math.max(0.5, Math.round(r * 100) / 100));

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      voices: {
        A: { namedVoiceId: slots.A, rate: 0.9, pitch: -2 },
        B: { namedVoiceId: slots.B, rate: 0.9, pitch: -1 },
      },
      activeSlot: 'A',
      alternating: false,
      languageMode: 'auto',
      scope: 'selection',
      deviceVoiceUri: { en: null, bn: null },
      paragraphGapMs: 700,
      crossfadeMs: 120,
      fadeEdgesMs: 180,
      ambientBed: 'off',
      ambientLevel: 0.1,
      configured: false,

      setSlotVoice: (slot, namedVoiceId) =>
        set((s) => ({ voices: { ...s.voices, [slot]: { ...s.voices[slot], namedVoiceId } } })),
      setSlotParam: (slot, patch) =>
        set((s) => ({ voices: { ...s.voices, [slot]: { ...s.voices[slot], ...patch } } })),
      setActiveRate: (rate) =>
        set((s) => ({
          voices: {
            ...s.voices,
            [s.activeSlot]: { ...s.voices[s.activeSlot], rate: clampRate(rate) },
          },
        })),
      setActiveSlot: (slot) => set({ activeSlot: slot }),
      toggleAlternating: () => set((s) => ({ alternating: !s.alternating })),
      setLanguageMode: (languageMode) => set({ languageMode }),
      setScope: (scope) => set({ scope }),
      setDeviceVoice: (lang, uri) =>
        set((s) => ({ deviceVoiceUri: { ...s.deviceVoiceUri, [lang]: uri } })),
      patch: (p) => set(p),
      markConfigured: () => set({ configured: true }),
    }),
    { name: 'audio-reader.voice', version: 3 },
  ),
);
