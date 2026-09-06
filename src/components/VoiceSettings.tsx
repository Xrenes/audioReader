import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useVoiceStore, type VoiceSlot } from '@/store/voiceStore';
import { voiceManager } from '@/tts/voiceManager';
import { BrowserSpeaker } from '@/audio/browserSpeaker';
import {
  getAzureCreds,
  setAzureCreds,
  getElevenLabsCreds,
  setElevenLabsCreds,
  getXttsUrl,
  setXttsUrl,
} from '@/config/credentials';
import { xttsEngine } from '@/tts/xttsEngine';
import { Field, Segmented, Slider, Toggle, Select } from './controls';
import './voicesettings.css';

const NAMED = voiceManager.list();
const nameOf = (id: string) => NAMED.find((n) => n.id === id)?.displayName ?? id;

/**
 * The Settings panel. Simple controls up top (voice, speed, language, scope,
 * ambient); anything fiddly — device-voice picker, API keys, XTTS URL —
 * lives in a collapsed "Advanced" section at the bottom.
 */
export function VoiceSettings() {
  const v = useVoiceStore();
  const selectionText = useReaderStore((s) => s.selectionText);
  const pdfTheme = useReaderStore((s) => s.pdfTheme);
  const togglePdfTheme = useReaderStore((s) => s.togglePdfTheme);

  return (
    <div className="vs">
      {selectionText && (
        <section className="vs-section">
          <h3>Selected passage</h3>
          <p className="vs-passage">
            {selectionText.slice(0, 260)}
            {selectionText.length > 260 ? '…' : ''}
          </p>
        </section>
      )}

      <section className="vs-section">
        <h3>Page</h3>
        <Segmented
          value={pdfTheme}
          onChange={(t) => t !== pdfTheme && togglePdfTheme()}
          options={[
            { value: 'light', label: '☀ Bright' },
            { value: 'dark', label: '☾ Dark' },
          ]}
        />
      </section>

      <section className="vs-section">
        <h3>Who reads</h3>
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

      <AdvancedSection />
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
        <span className="vs-dot" /> {nameOf(cfg.namedVoiceId)}
      </h3>

      <Field label="Voice">
        <Select
          value={cfg.namedVoiceId}
          onChange={(id) => setSlotVoice(slot, id)}
          options={NAMED.map((n) => ({ value: n.id, label: n.displayName }))}
        />
      </Field>

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

/* ---------------------------------------------------------------------------
   Advanced — device-voice picker + neural engine credentials, collapsed.
   --------------------------------------------------------------------------- */

function AdvancedSection() {
  const [open, setOpen] = useState(false);
  return (
    <section className="vs-section vs-advanced">
      <button className="vs-advanced-toggle" onClick={() => setOpen((o) => !o)}>
        <span>Advanced — voice engines</span>
        <span className={`vs-chev${open ? ' open' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="vs-advanced-body">
          <DeviceVoicePicker />
          <EngineCreds />
        </div>
      )}
    </section>
  );
}

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
    const voice = uri ? list.find((x) => x.voiceURI === uri) : list[0];
    const u = new SpeechSynthesisUtterance(
      lang === 'bn' ? 'এটি একটি নমুনা পাঠ।' : 'The quiet library at dusk. She began to read.',
    );
    if (voice) u.voice = voice;
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
              { value: '__auto', label: `Auto — best (${list[0]?.name ?? '—'})` },
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
    <div className="vs-adv-block">
      <h4>Device voice</h4>
      <p className="vs-adv-hint">Used when no neural engine is set. Online voices sound best.</p>
      {row('en', enVoices)}
      {row('bn', bnVoices)}
    </div>
  );
}

function EngineCreds() {
  const [azKey, setAzKey] = useState('');
  const [region, setRegion] = useState('southeastasia');
  const [elKey, setElKey] = useState('');
  const [xUrl, setXUrl] = useState('http://localhost:8020');
  const [xStatus, setXStatus] = useState<'idle' | 'checking' | 'up' | 'down'>('idle');

  useEffect(() => {
    getAzureCreds().then((c) => {
      if (c) {
        setAzKey(c.key);
        setRegion(c.region);
      }
    });
    getElevenLabsCreds().then((c) => c && setElKey(c.key));
    getXttsUrl().then((u) => setXUrl(u || ''));
  }, []);

  const checkXtts = async () => {
    setXStatus('checking');
    setXStatus((await xttsEngine.available()) ? 'up' : 'down');
  };

  return (
    <div className="vs-adv-block">
      <h4>Neural engines</h4>
      <p className="vs-adv-hint">
        Optional. Keys are stored only on this device. Without one, the device voice is used.
      </p>

      <label className="vs-adv-label">ElevenLabs — English</label>
      <input
        className="vs-adv-input"
        type="password"
        placeholder="API key"
        value={elKey}
        onChange={(e) => setElKey(e.target.value)}
        onBlur={() => setElevenLabsCreds(elKey ? { key: elKey } : null)}
      />

      <label className="vs-adv-label">Azure Speech — Bangla</label>
      <input
        className="vs-adv-input"
        type="password"
        placeholder="Speech key"
        value={azKey}
        onChange={(e) => setAzKey(e.target.value)}
        onBlur={() => setAzureCreds(azKey ? { key: azKey, region } : null)}
      />
      <input
        className="vs-adv-input"
        type="text"
        placeholder="Region (e.g. southeastasia)"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        onBlur={() => setAzureCreds(azKey ? { key: azKey, region } : null)}
      />

      <label className="vs-adv-label">My Voice — local XTTS server</label>
      <input
        className="vs-adv-input"
        type="text"
        placeholder="http://localhost:8020"
        value={xUrl}
        onChange={(e) => setXUrl(e.target.value)}
        onBlur={async () => {
          await setXttsUrl(xUrl.trim() || null);
          void checkXtts();
        }}
      />
      <div className="vs-adv-xtts">
        <button className="vs-adv-check" onClick={checkXtts} disabled={xStatus === 'checking'}>
          {xStatus === 'checking' ? 'Checking…' : 'Test'}
        </button>
        <span className={`vs-adv-badge${xStatus === 'up' ? ' ok' : ''}`} data-down={xStatus === 'down'}>
          {xStatus === 'up' ? 'Connected' : xStatus === 'down' ? 'Not reachable' : 'Not checked'}
        </span>
      </div>
    </div>
  );
}
