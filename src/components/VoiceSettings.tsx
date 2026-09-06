import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useVoiceStore, type VoiceSlot } from '@/store/voiceStore';
import { voiceManager } from '@/tts/voiceManager';
import { BrowserSpeaker } from '@/audio/browserSpeaker';
import { Field, Segmented, Slider, Toggle, Select } from './controls';
import './voicesettings.css';

const NAMED = voiceManager.list(); // [{ id: 'ahmed', displayName: 'Ahmed' }, ...]
const nameOf = (id: string) => NAMED.find((n) => n.id === id)?.displayName ?? id;

/**
 * The right panel. Same component before and during reading — every control
 * is live. Changing a voice or speed applies from the next sentence.
 */
export function VoiceSettings() {
  const v = useVoiceStore();
  const selectionText = useReaderStore((s) => s.selectionText);
  const readingMode = useReaderStore((s) => s.readingMode);

  return (
    <div className="vs">
      {selectionText && (
        <section className="vs-section">
          <h3>Selected passage</h3>
          <p className="vs-passage">{selectionText.slice(0, 320)}{selectionText.length > 320 ? '…' : ''}</p>
        </section>
      )}

      <section className="vs-section">
        <h3>Who reads now</h3>
        <Segmented<VoiceSlot>
          value={v.activeSlot}
          onChange={v.setActiveSlot}
          options={[
            { value: 'A', label: nameOf(v.voices.A.namedVoiceId) },
            { value: 'B', label: nameOf(v.voices.B.namedVoiceId) },
          ]}
        />
        <Toggle
          checked={v.alternating}
          onChange={() => v.toggleAlternating()}
          label={`Alternate ${nameOf(v.voices.A.namedVoiceId)} and ${nameOf(
            v.voices.B.namedVoiceId,
          )} by paragraph`}
        />
      </section>

      <VoicePane slot="A" />
      <VoicePane slot="B" />

      <DeviceVoicePicker />

      <section className="vs-section">
        <h3>Language</h3>
        <Segmented
          value={v.languageMode}
          onChange={v.setLanguageMode}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা' },
          ]}
        />
      </section>

      <section className="vs-section">
        <h3>Read</h3>
        <Segmented
          value={v.scope}
          onChange={v.setScope}
          options={[
            { value: 'selection', label: 'Selection' },
            { value: 'toPageEnd', label: 'To page end' },
            { value: 'toDocEnd', label: 'To doc end' },
          ]}
        />
      </section>

      <section className="vs-section">
        <h3>Calm playback</h3>
        <Field label="Paragraph pause" hint={`${v.paragraphGapMs} ms`}>
          <Slider
            min={200}
            max={1500}
            step={50}
            value={v.paragraphGapMs}
            onChange={(paragraphGapMs) => v.patch({ paragraphGapMs })}
            format={(n) => `${n}ms`}
          />
        </Field>
        <Field label="Crossfade" hint={`${v.crossfadeMs} ms`}>
          <Slider
            min={0}
            max={400}
            step={10}
            value={v.crossfadeMs}
            onChange={(crossfadeMs) => v.patch({ crossfadeMs })}
            format={(n) => `${n}ms`}
          />
        </Field>
        <Field label="Ambient bed">
          <Select
            value={v.ambientBed}
            onChange={(ambientBed) => v.patch({ ambientBed })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'rain', label: 'Soft rain' },
              { value: 'brown', label: 'Brown noise' },
            ]}
          />
        </Field>
        {v.ambientBed !== 'off' && (
          <Field label="Ambient level" hint={`${Math.round(v.ambientLevel * 100)}%`}>
            <Slider
              min={0}
              max={0.3}
              step={0.01}
              value={v.ambientLevel}
              onChange={(ambientLevel) => v.patch({ ambientLevel })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
          </Field>
        )}
      </section>

      {!readingMode && (
        <p className="vs-note">These settings stay editable while reading.</p>
      )}
    </div>
  );
}

function VoicePane({ slot }: { slot: VoiceSlot }) {
  const cfg = useVoiceStore((s) => s.voices[slot]);
  const setSlotVoice = useVoiceStore((s) => s.setSlotVoice);
  const setSlotParam = useVoiceStore((s) => s.setSlotParam);

  return (
    <section className={`vs-section vs-voice vs-voice-${slot.toLowerCase()}`}>
      <h3>
        <span className="vs-dot" /> Slot {slot}
      </h3>

      <Field label="Voice">
        <Select
          value={cfg.namedVoiceId}
          onChange={(id) => setSlotVoice(slot, id)}
          options={NAMED.map((n) => ({ value: n.id, label: n.displayName }))}
        />
      </Field>

      <p className="vs-voice-src">{voiceManager.describe(cfg.namedVoiceId)}</p>

      <Field label="Speed" hint={`${cfg.rate.toFixed(2)}×`}>
        <Slider
          min={0.5}
          max={1.5}
          step={0.01}
          value={cfg.rate}
          onChange={(rate) => setSlotParam(slot, { rate })}
          format={(n) => `${n.toFixed(2)}×`}
        />
      </Field>

      <Field label="Pitch" hint={`${cfg.pitch > 0 ? '+' : ''}${cfg.pitch} st`}>
        <Slider
          min={-8}
          max={4}
          step={1}
          value={cfg.pitch}
          onChange={(pitch) => setSlotParam(slot, { pitch })}
          format={(n) => `${n > 0 ? '+' : ''}${n}`}
        />
      </Field>
    </section>
  );
}

/**
 * Which system voice the device-voice fallback should use. Only relevant
 * when no neural engine is configured — but that's exactly when it matters
 * for "less robotic". Voices are ranked best-first; "Preview" speaks a line.
 */
function DeviceVoicePicker() {
  const deviceVoiceUri = useVoiceStore((s) => s.deviceVoiceUri);
  const setDeviceVoice = useVoiceStore((s) => s.setDeviceVoice);
  const [enVoices, setEnVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [bnVoices, setBnVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!BrowserSpeaker.supported()) return;
    BrowserSpeaker.voicesFor('en').then(setEnVoices);
    BrowserSpeaker.voicesFor('bn').then(setBnVoices);
  }, []);

  const preview = (uri: string | null, lang: 'en' | 'bn') => {
    const list = lang === 'bn' ? bnVoices : enVoices;
    const v = uri ? list.find((x) => x.voiceURI === uri) : list[0];
    const u = new SpeechSynthesisUtterance(
      lang === 'bn' ? 'এটি একটি নমুনা পাঠ।' : 'The quiet library at dusk. She began to read.',
    );
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = 0.83;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  if (!BrowserSpeaker.supported() || (!enVoices.length && !bnVoices.length)) return null;

  const row = (lang: 'en' | 'bn', list: SpeechSynthesisVoice[]) =>
    list.length ? (
      <Field label={lang === 'bn' ? 'Bangla device voice' : 'English device voice'}>
        <div className="vs-dv-row">
          <Select
            value={deviceVoiceUri[lang] ?? '__auto'}
            onChange={(uri) => setDeviceVoice(lang, uri === '__auto' ? null : uri)}
            options={[
              { value: '__auto', label: `Auto — best available (${list[0]?.name ?? '—'})` },
              ...list.map((x) => ({
                value: x.voiceURI,
                label: `${x.name}${x.localService ? '' : ' · online'}`,
              })),
            ]}
          />
          <button
            className="vs-dv-preview"
            onClick={() => preview(deviceVoiceUri[lang], lang)}
            aria-label="Preview"
          >
            ▶
          </button>
        </div>
      </Field>
    ) : null;

  return (
    <section className="vs-section">
      <h3>Device voice</h3>
      <p className="vs-voice-src">
        Used only when no neural engine is set. Online / “Natural” voices sound best.
      </p>
      {row('en', enVoices)}
      {row('bn', bnVoices)}
    </section>
  );
}
