/* ============================================================
   VoiceManager — the display-name -> real-provider-voice layer.

   The UI only ever shows "Ahmed" / "Akter". Everything downstream
   (synthesis, caching) works with the resolved provider voice id,
   which differs per language. Change providers in voices.json
   without touching any UI code.
   ============================================================ */

import type { Lang } from '@/store/voiceStore';
import voicesConfig from '@/config/voices.json';

export type ProviderId = 'elevenlabs' | 'azure' | 'piper' | 'xtts' | 'browser';

export interface ResolvedVoice {
  /** display-name id, e.g. "ahmed" */
  namedVoiceId: string;
  displayName: string;
  lang: Lang;
  provider: ProviderId;
  providerVoiceId: string;
  /** provider-specific extras */
  locale?: string;
  modelId?: string;
  style?: string | null;
  settings?: Record<string, number>;
}

interface LangMapping {
  provider: ProviderId;
  provider_voice_id: string;
  model_id?: string;
  locale?: string;
  style?: string | null;
  settings?: Record<string, number>;
}

export interface NamedVoice {
  id: string;
  display_name: string;
  gender?: string;
  enabled?: boolean;
  byLang: Partial<Record<Lang, LangMapping>>;
}

class VoiceManager {
  private voices: NamedVoice[];

  constructor() {
    this.voices = (voicesConfig.voices as NamedVoice[]).filter((v) => v.enabled !== false);
  }

  /** All named voices for the UI selector. */
  list(): { id: string; displayName: string }[] {
    return this.voices.map((v) => ({ id: v.id, displayName: v.display_name }));
  }

  getById(id: string): NamedVoice | null {
    return this.voices.find((v) => v.id === id) ?? null;
  }

  /** The default first / second slot voices. */
  defaultSlotIds(): { A: string; B: string } {
    return {
      A: this.voices[0]?.id ?? 'ahmed',
      B: this.voices[1]?.id ?? this.voices[0]?.id ?? 'akter',
    };
  }

  /**
   * Resolve a named voice + language to a concrete provider voice.
   * Falls back to the other language's mapping, then to browser TTS,
   * so a missing bn mapping never hard-fails.
   */
  resolve(namedVoiceId: string, lang: Lang): ResolvedVoice {
    const v = this.getById(namedVoiceId) ?? this.voices[0];
    const mapping = v?.byLang[lang] ?? v?.byLang[lang === 'en' ? 'bn' : 'en'];

    if (!v || !mapping) {
      return {
        namedVoiceId: namedVoiceId,
        displayName: v?.display_name ?? namedVoiceId,
        lang,
        provider: 'browser',
        providerVoiceId: '',
      };
    }

    return {
      namedVoiceId: v.id,
      displayName: v.display_name,
      lang,
      provider: mapping.provider,
      providerVoiceId: mapping.provider_voice_id,
      locale: mapping.locale,
      modelId: mapping.model_id,
      style: mapping.style ?? undefined,
      settings: mapping.settings,
    };
  }

  /** Human-readable summary for the settings panel, e.g. "ElevenLabs · Azure (bn)". */
  describe(namedVoiceId: string): string {
    const v = this.getById(namedVoiceId);
    if (!v) return '';
    const parts: string[] = [];
    for (const lang of ['en', 'bn'] as Lang[]) {
      const m = v.byLang[lang];
      if (m) parts.push(`${prettyProvider(m.provider)} (${lang})`);
    }
    return parts.join(' · ');
  }
}

function prettyProvider(p: ProviderId): string {
  switch (p) {
    case 'elevenlabs':
      return 'ElevenLabs';
    case 'azure':
      return 'Azure';
    case 'piper':
      return 'Piper (offline)';
    case 'xtts':
      return 'My Voice (XTTS)';
    default:
      return 'Device';
  }
}

export const voiceManager = new VoiceManager();
