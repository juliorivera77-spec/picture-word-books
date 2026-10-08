import { useEffect, useRef, useState } from 'react';
import { generatePicture } from '../lib/ai';
import { listUserImages, putImage, uid } from '../lib/db';
import { shrinkImage } from '../lib/images';
import { useOnline } from '../lib/settings';
import { searchArasaac } from '../lib/symbols/arasaac';
import { searchMulberry } from '../lib/symbols/mulberry';
import { candidatesFor } from '../lib/symbols/resolver';
import type { Settings, SymbolRef, Token } from '../lib/types';
import { DrawPad } from './DrawPad';
import { SymbolImage } from './SymbolImage';

export interface PickResult {
  sym: SymbolRef;
  always: boolean;
}

/** Choose or make the picture for one word. */
export function SymbolPicker({
  token,
  phrase,
  sentence,
  settings,
  onPick,
  onFixWord,
  onSplit,
  onClose,
}: {
  token: Token;
  phrase: string;
  sentence: string;
  settings: Settings;
  onPick: (r: PickResult) => void;
  onFixWord: (text: string) => void;
  onSplit?: () => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const [query, setQuery] = useState(phrase.toLowerCase());
  const [results, setResults] = useState<SymbolRef[] | null>(null);
  const [always, setAlways] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [wordText, setWordText] = useState(token.text);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Start with the best matches for this word and its other forms.
  useEffect(() => {
    candidatesFor([phrase.toLowerCase(), token.key, ...token.alts], settings.sourceOrder).then(setResults);
  }, [phrase, token, settings.sourceOrder]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    setBusy('Searching…');
    setError('');
    try {
      const [a, m, mine] = await Promise.all([
        searchArasaac(q),
        searchMulberry(q),
        listUserImages().then((l) => l.filter((x) => x.label?.toLowerCase().includes(q)).map((x) => x.id)),
      ]);
      const ar = a.map((id) => `a:${id}`);
      const mu = m.map((n) => `m:${n}`);
      const ordered = settings.sourceOrder[0] === 'mulberry' ? [...mu, ...ar] : [...ar, ...mu];
      setResults([...mine, ...ordered]);
    } finally {
      setBusy('');
    }
  };

  const saveUserImage = async (blob: Blob, kind: 'photo' | 'drawing') => {
    const ref = `u:${uid()}`;
    await putImage(ref, await shrinkImage(blob, 400, kind === 'photo' ? 'image/jpeg' : 'image/png'), kind, token.key);
    onPick({ sym: ref, always });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await saveUserImage(f, 'photo');
  };

  const ai = async () => {
    setBusy('Drawing a picture with AI… this can take up to a minute.');
    setError('');
    try {
      onPick({ sym: await generatePicture(phrase, sentence, settings), always });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (drawing)
    return (
      <Modal onClose={onClose} title={`Draw “${phrase}”`}>
        <DrawPad onCancel={() => setDrawing(false)} onSave={(b) => saveUserImage(b, 'drawing')} />
      </Modal>
    );

  return (
    <Modal onClose={onClose} title={`Picture for “${phrase}”`}>
      <div className="picker-current">
        <SymbolImage symbol={token.sym} alt="current picture" />
        <div className="grow">
          <label className="field">
            <span>Word (fix it if the photo was misread)</span>
            <div className="row">
              <input value={wordText} onChange={(e) => setWordText(e.target.value)} />
              <button
                type="button"
                className="btn"
                disabled={!wordText.trim() || wordText === token.text}
                onClick={() => onFixWord(wordText.trim())}
              >
                Fix
              </button>
            </div>
          </label>
          {onSplit && (
            <button type="button" className="link" onClick={onSplit}>
              Show “{phrase}” as separate words
            </button>
          )}
        </div>
      </div>

      <div className="row wrap picker-actions">
        <button type="button" className="btn" onClick={() => photoInput.current?.click()}>📷 Take photo</button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>🖼️ Choose image</button>
        <button type="button" className="btn" onClick={() => setDrawing(true)}>✏️ Draw</button>
        {settings.aiEnabled && (
          <button type="button" className="btn" disabled={!online || !settings.aiKey || !!busy} onClick={ai} title={!online ? 'Needs internet' : ''}>
            ✨ AI picture{!online ? ' (offline)' : ''}
          </button>
        )}
        <button type="button" className="btn" onClick={() => onPick({ sym: 'none', always })}>🚫 No picture</button>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      <form className="row" onSubmit={search}>
        <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a picture…" />
        <button className="btn primary" type="submit">Search</button>
      </form>
      {!online && <p className="hint">Offline: searching the pictures saved on this device.</p>}
      {busy && <p className="hint">{busy}</p>}
      {error && <p className="error">{error}</p>}

      <div className="picker-grid">
        {results === null && <p className="hint">Loading…</p>}
        {results?.length === 0 && <p className="hint">No pictures found. Try another word, take a photo, or draw one.</p>}
        {results?.map((r) => (
          <button key={r} type="button" className={`pick ${r === token.sym ? 'on' : ''}`} onClick={() => onPick({ sym: r, always })}>
            <SymbolImage symbol={r} alt="" />
          </button>
        ))}
      </div>

      <label className="row check">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
        Always use this picture for “{phrase.toLowerCase()}” (in every book)
      </label>
    </Modal>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
