import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { testConnection } from '../lib/ai';
import { exportBackup, importBackup } from '../lib/backup';
import { countImages } from '../lib/db';
import { useOnline, useSettings } from '../lib/settings';
import { canSpeak, speak, voices } from '../lib/speech';
import { ARASAAC_INDEX_VERSION, arasaacMeta, downloadAllArasaac, downloadArasaacIndex, type ArasaacMeta } from '../lib/symbols/arasaac';
import type { TextCase, WordPosition } from '../lib/types';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const online = useOnline();
  const [meta, setMeta] = useState<ArasaacMeta | undefined>();
  const [saved, setSaved] = useState(0);
  const [dictStatus, setDictStatus] = useState('');
  const [allProgress, setAllProgress] = useState<[number, number] | null>(null);
  const [storage, setStorage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [voiceList, setVoiceList] = useState(voices());
  const [backupMsg, setBackupMsg] = useState('');
  const [updateMsg, setUpdateMsg] = useState('');
  const checkUpdate = async () => {
    setUpdateMsg('Checking…');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) {
        location.reload();
        return;
      }
      await reg.update();
      if (reg.installing || reg.waiting) {
        setUpdateMsg('Downloading the new version… the app will restart by itself.');
        // If it has not restarted after a while, reload to pick it up.
        setTimeout(() => location.reload(), 15000);
      } else setUpdateMsg('You have the latest version.');
    } catch {
      setUpdateMsg('Could not check right now. Try again when online.');
    }
  };
  const [aiTest, setAiTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const testAi = async () => {
    setAiTest({ ok: true, msg: 'Checking…' });
    try {
      setAiTest({ ok: true, msg: await testConnection(settings) });
    } catch (e) {
      setAiTest({ ok: false, msg: (e as Error).message });
    }
  };
  const abort = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const refreshStorage = async () => {
    setSaved(await countImages('arasaac'));
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) setStorage(`${(est.usage / 1e6).toFixed(0)} MB used on this device`);
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
  };

  useEffect(() => {
    arasaacMeta().then(setMeta);
    refreshStorage();
    if (canSpeak) speechSynthesis.onvoiceschanged = () => setVoiceList(voices());
    return () => abort.current?.abort();
  }, []);

  const getDict = async () => {
    setDictStatus('');
    try {
      await navigator.storage?.persist?.();
      setMeta(await downloadArasaacIndex(setDictStatus));
      setDictStatus('Done! Words can now be matched with no internet.');
    } catch (e) {
      setDictStatus(`Download failed: ${(e as Error).message}`);
    }
    refreshStorage();
  };

  const getAll = async () => {
    abort.current = new AbortController();
    setAllProgress([0, 1]);
    try {
      await downloadAllArasaac((d, t) => setAllProgress([d, t]), abort.current.signal);
    } catch (e) {
      setDictStatus((e as Error).message);
    }
    setAllProgress(null);
    refreshStorage();
  };

  const doExport = async () => {
    setBackupMsg('Preparing backup…');
    const blob = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `picture-books-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setBackupMsg('Backup saved.');
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const n = await importBackup(f);
      setBackupMsg(`Restored ${n} book${n === 1 ? '' : 's'}.`);
    } catch (err) {
      setBackupMsg((err as Error).message);
    }
  };

  return (
    <div className="page settings">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back">←</Link>
        <h1>Settings</h1>
        <span />
      </header>

      <section className="panel">
        <h2>Display</h2>
        <label className="field">
          <span>Picture size: {settings.pictureSize}px</span>
          <input type="range" min={48} max={200} step={8} value={settings.pictureSize} onChange={(e) => update({ pictureSize: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Word size: {settings.fontSize}px</span>
          <input type="range" min={14} max={48} value={settings.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Word position</span>
          <select value={settings.wordPosition} onChange={(e) => update({ wordPosition: e.target.value as WordPosition })}>
            <option value="below">Word below the picture</option>
            <option value="above">Word above the picture</option>
          </select>
        </label>
        <label className="field">
          <span>Letters</span>
          <select value={settings.textCase} onChange={(e) => update({ textCase: e.target.value as TextCase })}>
            <option value="asis">As written in the book</option>
            <option value="lower">all lower case</option>
            <option value="upper">ALL CAPITALS</option>
          </select>
        </label>
        <label className="row check">
          <input type="checkbox" checked={settings.colorCode} onChange={(e) => update({ colorCode: e.target.checked })} />
          Colour-code words by type (Modified Fitzgerald Key)
        </label>
        {settings.colorCode && (
          <div className="legend">
            <span className="fk fk-pronoun">people</span>
            <span className="fk fk-verb">actions</span>
            <span className="fk fk-describe">describing</span>
            <span className="fk fk-noun">things</span>
            <span className="fk fk-preposition">places</span>
            <span className="fk fk-question">questions</span>
            <span className="fk fk-negation">no / not</span>
            <span className="fk fk-social">social</span>
            <span className="fk fk-little">little words</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Pictures</h2>
        <label className="field">
          <span>Preferred picture style</span>
          <select
            value={settings.sourceOrder[0]}
            onChange={(e) => update({ sourceOrder: e.target.value === 'mulberry' ? ['mulberry', 'arasaac'] : ['arasaac', 'mulberry'] })}
          >
            <option value="arasaac">ARASAAC first (most words, colourful)</option>
            <option value="mulberry">Mulberry first (simple, clean)</option>
          </select>
        </label>

        <h3>ARASAAC offline dictionary</h3>
        <p>
          Built in: pictures for about 300 everyday little words (is, not, the, he, can…) and the Mulberry set (about 3,400 symbols).
          ARASAAC adds about 13,000 more. Download its word list once so every word can be matched offline; pictures for each book are
          saved automatically when you make it.
        </p>
        <p className="hint">
          {meta
            ? `Dictionary saved ${new Date(meta.date).toLocaleDateString()}: ${meta.words.toLocaleString()} words, ${meta.pictograms.toLocaleString()} pictograms. ${saved.toLocaleString()} pictures saved on this device.`
            : 'Dictionary not downloaded yet.'}
        </p>
        <div className="row wrap">
          <button type="button" className="btn primary" disabled={!online || !!allProgress} onClick={getDict}>
            {!meta ? 'Download word list (one time)' : (meta.version ?? 1) < ARASAAC_INDEX_VERSION ? 'Update word list (recommended)' : 'Update word list'}
          </button>
          {meta && !allProgress && (
            <button type="button" className="btn" disabled={!online} onClick={getAll}>
              Save every ARASAAC picture (≈ 300 MB)
            </button>
          )}
          {allProgress && (
            <>
              <progress value={allProgress[0]} max={allProgress[1]} />
              <span>{allProgress[0].toLocaleString()} / {allProgress[1].toLocaleString()}</span>
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button>
            </>
          )}
        </div>
        {!online && <p className="hint">Connect to the internet to download.</p>}
        {dictStatus && <p className="hint">{dictStatus}</p>}
        <p className="hint">
          {storage}
          {persisted === false && (
            <>
              {' '}·{' '}
              <button type="button" className="link" onClick={async () => setPersisted(await navigator.storage.persist())}>
                Protect saved books from being cleared by the browser
              </button>
            </>
          )}
          {persisted && ' · Storage is protected.'}
        </p>
      </section>

      <section className="panel">
        <h2>AI helper (optional, needs internet)</h2>
        <p>
          With your own OpenAI API key the app can: <strong>read each whole sentence</strong> so words get the picture for the right
          meaning (“on top of the table” instead of a clothing top), <strong>read page photos</strong> much more accurately, and{' '}
          <strong>draw a picture</strong> for any word that has no symbol. OpenAI charges your account for this, not the app: reading a book costs a few cents, and each drawn picture about 1¢ (pictures are drawn once and reused).
          The key is stored only on this device; page text and photos are sent to OpenAI when AI is used. Everything it makes is saved and
          works offline.
        </p>
        <label className="row check">
          <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => update({ aiEnabled: e.target.checked, ...(e.target.checked ? { aiAuto: true, aiContext: true, aiOcr: true } : {}) })} />
          Turn on the AI helper
        </label>
        {settings.aiEnabled && (
          <>
            <label className="field">
              <span>OpenAI API key</span>
              <input type="password" autoComplete="off" value={settings.aiKey} placeholder="sk-…" onChange={(e) => update({ aiKey: e.target.value.trim() })} />
            </label>
            <div className="row wrap">
              <button type="button" className="btn" disabled={!online || !settings.aiKey} onClick={testAi}>Test my key</button>
              {aiTest && <span className={aiTest.ok ? 'hint' : 'error'}>{aiTest.msg}</span>}
            </div>
            <label className="row check">
              <input type="checkbox" checked={settings.aiContext} onChange={(e) => update({ aiContext: e.target.checked })} />
              Read whole sentences to choose the right picture for each word
            </label>
            <label className="row check">
              <input type="checkbox" checked={settings.aiOcr} onChange={(e) => update({ aiOcr: e.target.checked })} />
              Use AI to read the words in page photos
            </label>
            <label className="row check">
              <input type="checkbox" checked={settings.aiAuto} onChange={(e) => update({ aiAuto: e.target.checked })} />
              Draw pictures automatically for words with no symbol when making a book
            </label>
            <details>
              <summary className="hint">Advanced: models</summary>
              <label className="field">
                <span>Reading model (sentences and photos)</span>
                <input value={settings.aiTextModel} onChange={(e) => update({ aiTextModel: e.target.value.trim() })} />
              </label>
              <label className="field">
                <span>Drawing model</span>
                <input value={settings.aiModel} onChange={(e) => update({ aiModel: e.target.value.trim() })} />
              </label>
              <p className="hint">If a model is not available on your account, the app tries other common models automatically.</p>
            </details>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Reading aloud</h2>
        {canSpeak ? (
          <>
            <label className="field">
              <span>Voice</span>
              <select value={settings.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
                <option value="">Device default</option>
                {voiceList.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? '' : ' — online'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Speed: {settings.speechRate.toFixed(2)}×</span>
              <input type="range" min={0.5} max={1.3} step={0.05} value={settings.speechRate} onChange={(e) => update({ speechRate: Number(e.target.value) })} />
            </label>
            <button type="button" className="btn" onClick={() => speak('The little dog runs to the park.', { voiceURI: settings.voiceURI, rate: settings.speechRate })}>
              🔊 Test voice
            </button>
          </>
        ) : (
          <p>This browser cannot read aloud.</p>
        )}
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p>Books are stored only on this device. Save a backup file to keep them safe or move them to another device.</p>
        <div className="row wrap">
          <button type="button" className="btn" onClick={doExport}>⬇️ Save backup</button>
          <button type="button" className="btn" onClick={() => importInput.current?.click()}>⬆️ Restore backup</button>
          <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={doImport} />
        </div>
        {backupMsg && <p className="hint">{backupMsg}</p>}
      </section>

      <section className="panel">
        <h2>App version</h2>
        <p>
          Version from <strong>{__APP_VERSION__}</strong> (UTC). The app updates itself when you open it while online.
        </p>
        <div className="row wrap">
          <button type="button" className="btn" disabled={!online || updateMsg === 'Checking…'} onClick={checkUpdate}>
            Check for updates
          </button>
          {updateMsg && <span className="hint">{updateMsg}</span>}
        </div>
      </section>

      <section className="panel credits">
        <h2>Credits & licences</h2>
        <p>
          Pictographic symbols © Government of Aragón, author Sergio Palao. Origin: ARASAAC (
          <a href="https://arasaac.org" target="_blank" rel="noreferrer">arasaac.org</a>). Licence: CC BY-NC-SA 4.0. Built-in little-word pictograms via the Cboard project (cboard.io).
        </p>
        <p>
          Mulberry Symbols © Steve Lee (<a href="https://mulberrysymbols.org" target="_blank" rel="noreferrer">mulberrysymbols.org</a>). Licence: CC BY-SA 4.0.
        </p>
        <p>Text recognition by Tesseract.js (Apache 2.0). PDF reading by PDF.js (Apache 2.0).</p>
        <p className="hint">ARASAAC symbols may not be used commercially.</p>
      </section>
    </div>
  );
}
