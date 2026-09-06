import { useEffect, useState } from 'react';
import { useVoiceStore } from '@/store/voiceStore';
import { useReaderStore } from '@/store/readerStore';
import {
  getAzureCreds,
  setAzureCreds,
  getElevenLabsCreds,
  setElevenLabsCreds,
  getXttsUrl,
  setXttsUrl,
} from '@/config/credentials';
import { xttsEngine } from '@/tts/xttsEngine';
import { VoiceSettings } from './VoiceSettings';
import './setupsheet.css';

/**
 * Pre-reading setup. Shown the first time, before the user enters reading mode.
 * It is literally the live settings panel plus a credentials block and a
 * "Start reading" confirm. After confirming once, `configured` flips and this
 * is replaced by the plain live panel.
 *
 * Ahmed = ElevenLabs (English) + Azure (Bangla); Akter likewise. Both keys
 * live only on this device.
 */
export function SetupSheet({ inline = false }: { inline?: boolean }) {
  const markConfigured = useVoiceStore((s) => s.markConfigured);
  const enterReadingMode = useReaderStore((s) => s.enterReadingMode);
  const setSheet = useReaderStore((s) => s.setSheet);
  const selection = useReaderStore((s) => s.selection);

  const [azKey, setAzKey] = useState('');
  const [region, setRegion] = useState('southeastasia');
  const [azSaved, setAzSaved] = useState(false);

  const [elKey, setElKey] = useState('');
  const [elSaved, setElSaved] = useState(false);

  const [xUrl, setXUrl] = useState('http://localhost:8020');
  const [xStatus, setXStatus] = useState<'idle' | 'checking' | 'up' | 'down'>('idle');
  const [xVoices, setXVoices] = useState<string[]>([]);

  useEffect(() => {
    getAzureCreds().then((c) => {
      if (c) {
        setAzKey(c.key);
        setRegion(c.region);
        setAzSaved(true);
      }
    });
    getElevenLabsCreds().then((c) => {
      if (c) {
        setElKey(c.key);
        setElSaved(true);
      }
    });
    getXttsUrl().then((u) => {
      setXUrl(u || '');
      if (u) void checkXtts();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkXtts = async () => {
    setXStatus('checking');
    const ok = await xttsEngine.available();
    setXStatus(ok ? 'up' : 'down');
    if (ok) {
      const vs = await xttsEngine.voices('en');
      setXVoices(vs.map((v) => v.id));
    } else {
      setXVoices([]);
    }
  };

  const saveXtts = async () => {
    await setXttsUrl(xUrl.trim() || null);
    await checkXtts();
  };

  const saveAzure = async () => {
    await setAzureCreds(azKey ? { key: azKey, region } : null);
    setAzSaved(Boolean(azKey));
  };
  const saveEleven = async () => {
    await setElevenLabsCreds(elKey ? { key: elKey } : null);
    setElSaved(Boolean(elKey));
  };

  const start = () => {
    markConfigured();
    if (selection) enterReadingMode();
    setSheet(null);
  };

  const anyReal = azSaved || elSaved;

  return (
    <div className={`setup${inline ? ' setup-inline' : ''}`}>
      <section className="setup-cred vs-section">
        <h3>Voice engines</h3>
        <p className="setup-hint">
          Ahmed and Akter each use ElevenLabs for English and Azure for Bangla. Keys are stored only
          on this device. With no key, playback falls back to the basic device voice (robotic).
        </p>

        <label className="setup-sub">ElevenLabs — English</label>
        <input
          className="setup-input"
          type="password"
          placeholder="ElevenLabs API key"
          value={elKey}
          onChange={(e) => setElKey(e.target.value)}
          onBlur={saveEleven}
        />

        <label className="setup-sub">Azure Speech — Bangla</label>
        <input
          className="setup-input"
          type="password"
          placeholder="Azure Speech key"
          value={azKey}
          onChange={(e) => setAzKey(e.target.value)}
          onBlur={saveAzure}
        />
        <input
          className="setup-input"
          type="text"
          placeholder="Azure region (e.g. southeastasia)"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          onBlur={saveAzure}
        />

        <span className={`setup-badge${anyReal ? ' ok' : ''}`}>
          {elSaved && azSaved
            ? 'Ahmed & Akter fully ready'
            : elSaved
              ? 'English ready · Bangla will use device voice'
              : azSaved
                ? 'Bangla ready · English will use device voice'
                : 'Using device voice (robotic)'}
        </span>

        <label className="setup-sub">My Voice — local XTTS server</label>
        <p className="setup-hint">
          Reads in your own voice from a short reference clip. Start{' '}
          <code>xtts-server/run.bat</code>, then check the connection.
        </p>
        <input
          className="setup-input"
          type="text"
          placeholder="http://localhost:8020"
          value={xUrl}
          onChange={(e) => setXUrl(e.target.value)}
          onBlur={saveXtts}
        />
        <div className="setup-xtts-row">
          <button className="setup-check" onClick={checkXtts} disabled={xStatus === 'checking'}>
            {xStatus === 'checking' ? 'Checking…' : 'Test connection'}
          </button>
          <span
            className={`setup-badge${xStatus === 'up' ? ' ok' : ''}`}
            data-down={xStatus === 'down'}
          >
            {xStatus === 'up'
              ? xVoices.length
                ? `Connected · voices: ${xVoices.join(', ')}`
                : 'Connected · no voice clips found'
              : xStatus === 'down'
                ? 'Server not reachable'
                : 'Not checked'}
          </span>
        </div>
      </section>

      <VoiceSettings />

      <button className="setup-start glass-lit" onClick={start}>
        {selection ? 'Start reading' : 'Save setup'}
      </button>
    </div>
  );
}
