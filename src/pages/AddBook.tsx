import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createBook, generateMissing } from '../lib/books';
import { uid } from '../lib/db';
import { readImageText } from '../lib/importers/ocr';
import { useOnline, useSettings } from '../lib/settings';
import { splitPages } from '../lib/text';
import type { DraftPage } from '../lib/types';

type Mode = 'type' | 'photo' | 'file';

export function AddBook() {
  const { settings } = useSettings();
  const online = useOnline();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('photo');
  const [title, setTitle] = useState('');
  const [pasted, setPasted] = useState('');
  const [drafts, setDrafts] = useState<DraftPage[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ocrQueue = useRef(Promise.resolve());

  const patch = (id: string, p: Partial<DraftPage>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));

  /** Add photos as pages and read their text one at a time (OCR is heavy on phones). */
  const addPhotos = (files: FileList | File[]) => {
    const added = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ id: uid(), text: '', image: f as Blob, status: 'Waiting to read…' }));
    setDrafts((ds) => [...ds, ...added]);
    for (const d of added) {
      ocrQueue.current = ocrQueue.current.then(async () => {
        patch(d.id, { status: 'Reading words… 0%' });
        try {
          const text = await readImageText(d.image!, (p) => patch(d.id, { status: `Reading words… ${Math.round(p * 100)}%` }));
          patch(d.id, { text, status: text ? '' : 'No words found — type them in below.' });
        } catch (e) {
          patch(d.id, { status: `Could not read this photo (${(e as Error).message}). Type the words below.` });
        }
      });
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError('');
    for (const f of files) {
      const name = f.name.toLowerCase();
      try {
        if (f.type.startsWith('image/')) addPhotos([f]);
        else if (name.endsWith('.pdf') || f.type === 'application/pdf') {
          setStatus('Opening PDF…');
          const { importPdf } = await import('../lib/importers/pdf');
          const pages = await importPdf(f, setStatus);
          setDrafts((ds) => [...ds, ...pages.map((p) => ({ id: uid(), text: p.text, image: p.image }))]);
          if (!title) setTitle(f.name.replace(/\.pdf$/i, ''));
        } else if (name.endsWith('.epub')) {
          setStatus('Opening EPUB…');
          const { importEpub } = await import('../lib/importers/epub');
          const book = await importEpub(f, setStatus);
          setDrafts((ds) => [...ds, ...book.pages.map((p) => ({ id: uid(), text: p.text }))]);
          if (!title) setTitle(book.title ?? f.name.replace(/\.epub$/i, ''));
        } else {
          const text = await f.text();
          setDrafts((ds) => [...ds, ...splitPages(text).map((t) => ({ id: uid(), text: t }))]);
          if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
        }
      } catch (err) {
        setError(`Could not open ${f.name}: ${(err as Error).message}`);
      } finally {
        setStatus('');
      }
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    setDrafts((ds) => {
      const j = i + dir;
      if (j < 0 || j >= ds.length) return ds;
      const copy = [...ds];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const pagesToMake = mode === 'type' && drafts.length === 0 ? splitPages(pasted).map((text) => ({ id: uid(), text })) : drafts;
  const reading = drafts.some((d) => d.status?.startsWith('Reading') || d.status?.startsWith('Waiting'));

  const make = async () => {
    setError('');
    try {
      const { book, result } = await createBook(title, pagesToMake, settings, setStatus);
      if (result.missing.length && settings.aiEnabled && settings.aiAuto && settings.aiKey && navigator.onLine) {
        await generateMissing(book, settings, setStatus);
      }
      nav(`/book/${book.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back">←</Link>
        <h1>New book</h1>
        <span />
      </header>

      <label className="field">
        <span>Book title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Very Busy Bee" />
      </label>

      <div className="tabs" role="tablist">
        {(
          [
            ['photo', '📷 Photos of pages'],
            ['type', '✍️ Type or paste'],
            ['file', '📄 Upload a file'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'photo' && (
        <div className="panel">
          <p>Take a photo of each page, in order. The words are read on this device, and work without internet.</p>
          <div className="row wrap">
            <button type="button" className="btn primary big-btn" onClick={() => camera.current?.click()}>📷 Take a photo</button>
            <button type="button" className="btn big-btn" onClick={() => gallery.current?.click()}>🖼️ Choose photos</button>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = ''; }} />
          <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {mode === 'type' && (
        <div className="panel">
          <p>Type or paste the story. Leave an empty line between pages.</p>
          {drafts.length === 0 ? (
            <textarea rows={10} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'The cat sat on the mat.\n\nThe dog ran to the park.'} />
          ) : (
            <p className="hint">You already have pages below; edit them there.</p>
          )}
        </div>
      )}

      {mode === 'file' && (
        <div className="panel">
          <p>PDF, EPUB, text files or pictures of pages. Scanned PDFs are read with OCR.</p>
          <button type="button" className="btn primary big-btn" onClick={() => fileInput.current?.click()}>📄 Choose file</button>
          <input ref={fileInput} type="file" accept=".pdf,.epub,.txt,.text,.md,application/pdf,application/epub+zip,text/plain,image/*" multiple hidden onChange={onFile} />
        </div>
      )}

      {drafts.length > 0 && (
        <section>
          <h2>Pages ({drafts.length}) — check the words</h2>
          <div className="drafts">
            {drafts.map((d, i) => (
              <DraftRow
                key={d.id}
                draft={d}
                n={i + 1}
                onText={(text) => patch(d.id, { text })}
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                onDelete={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
              />
            ))}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}
      <div className="sticky-actions">
        {status && <span className="hint">{status}</span>}
        <button type="button" className="btn primary big-btn" disabled={!pagesToMake.some((p) => p.text.trim()) || !!status || reading} onClick={make}>
          {reading ? 'Reading photos…' : 'Make picture book ✨'}
        </button>
      </div>
      {!online && <p className="hint center">Offline — pictures come from the dictionaries saved on this device.</p>}
    </div>
  );
}

function DraftRow({
  draft,
  n,
  onText,
  onUp,
  onDown,
  onDelete,
}: {
  draft: DraftPage;
  n: number;
  onText: (t: string) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const url = useMemo(() => (draft.image ? URL.createObjectURL(draft.image) : null), [draft.image]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <div className="draft">
      <div className="draft-side">
        <strong>Page {n}</strong>
        {url && <img src={url} alt={`page ${n}`} />}
        <div className="row">
          <button type="button" className="icon-btn" onClick={onUp} aria-label="Move up">▲</button>
          <button type="button" className="icon-btn" onClick={onDown} aria-label="Move down">▼</button>
          <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete page">🗑️</button>
        </div>
      </div>
      <div className="grow">
        {draft.status && <p className="hint">{draft.status}</p>}
        <textarea rows={4} value={draft.text} onChange={(e) => onText(e.target.value)} placeholder="Words on this page" />
      </div>
    </div>
  );
}
