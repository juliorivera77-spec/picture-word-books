import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { aiReady, readPagePhoto, writeStory, type StoryRequest } from '../lib/ai';
import { createBook, generateMissing } from '../lib/books';
import { uid } from '../lib/db';
import { readImageText } from '../lib/importers/ocr';
import { CropTool, cropImage, type CropArea } from '../components/CropTool';
import { useOnline, useSettings } from '../lib/settings';
import { splitPages } from '../lib/text';
import type { DraftPage } from '../lib/types';

type Mode = 'type' | 'photo' | 'file' | 'ai';

export function AddBook() {
  const { settings } = useSettings();
  const online = useOnline();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('type');
  const [story, setStory] = useState<StoryRequest>({ topic: '', childName: '', kind: 'fun', level: 2, pages: 6, include: '' });
  const [writing, setWriting] = useState(false);
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

  /** Read the words in one photo: AI when it is on and online (far better on picture books), else on the device. */
  const readPhoto = async (id: string, image: Blob, area?: CropArea) => {
    const source = area ? await cropImage(image, area) : image;
    if (settings.aiOcr && aiReady(settings)) {
      patch(id, { status: 'AI is reading the words…' });
      try {
        const text = await readPagePhoto(source, settings);
        patch(id, { text, status: text ? '' : 'No story words found — type them in below.' });
        return;
      } catch (e) {
        patch(id, { status: `AI could not read it (${(e as Error).message}). Reading on this device instead…` });
      }
    }
    patch(id, { status: 'Reading words on this device… 0%' });
    try {
      const { text, unsure } = await readImageText(source, (p) => patch(id, { status: `Reading words on this device… ${Math.round(p * 100)}%` }));
      patch(id, {
        text,
        status: !text
          ? 'No words found. Try “Select the words” to box just the text, or type them in below.'
          : unsure
            ? 'Some words were hard to read — please check them. Tip: “Select the words” to box just the text.'
            : '',
      });
    } catch (e) {
      patch(id, { status: `Could not read this photo (${(e as Error).message}). Type the words below.` });
    }
  };

  /** Add photos as pages and read their text one at a time (reading is heavy on phones). */
  const addPhotos = (files: FileList | File[]) => {
    const added = Array.from(files)
      .filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name))
      .map((f) => ({ id: uid(), text: '', image: f as Blob, status: 'Waiting to read…' }));
    setDrafts((ds) => [...ds, ...added]);
    for (const d of added) queueRead(d.id, d.image!);
  };

  const queueRead = (id: string, image: Blob, area?: CropArea) => {
    patch(id, { status: 'Waiting to read…' });
    ocrQueue.current = ocrQueue.current.then(() => readPhoto(id, image, area));
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
  const reading = drafts.some((d) => /^(Reading|Waiting|AI is reading)/.test(d.status ?? ''));
  const [cropping, setCropping] = useState<DraftPage | null>(null);
  const [pickingPicture, setPickingPicture] = useState<DraftPage | null>(null);

  const make = async () => {
    setError('');
    try {
      const { book, result, aiError } = await createBook(title, pagesToMake, settings, setStatus);
      let error = aiError;
      if (!error && result.missing.length && settings.aiAuto && aiReady(settings)) {
        error = (await generateMissing(book, settings, setStatus))[0];
      }
      nav(`/book/${book.id}`, { replace: true, state: { aiError: error } });
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    }
  };

  const write = async () => {
    setError('');
    setWriting(true);
    try {
      const out = await writeStory(story, settings);
      setTitle(out.title);
      setDrafts(out.pages.map((text) => ({ id: uid(), text })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWriting(false);
    }
  };
  const canWrite = settings.aiEnabled && !!settings.aiKey;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back">←</Link>
        <h1>Make a book</h1>
        <span />
      </header>

      <ol className="steps">
        <li>Choose how to add the words.</li>
        <li>Check the words, then tap <strong>Make picture book</strong>.</li>
        <li>If some words have no picture, tap <strong>🧩 Fill in the blanks</strong> in the book.</li>
      </ol>

      <label className="field">
        <span>Book title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Very Busy Bee" />
      </label>

      <div className="tabs" role="tablist">
        {(
          [
            ['type', '✍️ Type or dictate'],
            ['photo', '📷 Photos of pages'],
            ['file', '📄 Upload a file'],
            ['ai', '✨ Write a story'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'photo' && (
        <div className="panel">
          <p>
            Take a photo of each page, in order — hold the phone flat above the page, in good light.{' '}
            {settings.aiOcr && aiReady(settings)
              ? 'AI reads the words (best for picture books).'
              : 'The words are read on this device, without internet. If it struggles, use “Select the words” to box just the text.'}{' '}
            Use <strong>🖼️ Select the picture</strong> to show the book’s illustration with the words.
          </p>
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
          <p>
            Type or paste the story — or tap the <strong>🎤</strong> on your keyboard and read it aloud. Press <strong>return twice</strong> to
            start a new page.
          </p>
          {drafts.length === 0 ? (
            <textarea rows={10} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'The cat sat on the mat.\n\nThe dog ran to the park.'} />
          ) : (
            <p className="hint">You already have pages below; edit them there.</p>
          )}
        </div>
      )}

      {mode === 'ai' && (
        <div className="panel">
          <p>Describe a story and AI writes it in simple words that are easy to show as pictures. You can change the words before making the book.</p>
          {!canWrite ? (
            <p className="notice">
              This needs the AI helper and your own OpenAI key (about 1¢ per story). Turn it on in <Link to="/settings">Settings → AI helper</Link>.
            </p>
          ) : (
            <>
              <label className="field">
                <span>What is the story about?</span>
                <textarea rows={2} value={story.topic} onChange={(e) => setStory({ ...story, topic: e.target.value })} placeholder="e.g. going to the dentist · a dog who loves trains · the first day at a new school" />
              </label>
              <div className="row wrap">
                <label className="field grow">
                  <span>Child’s name (optional)</span>
                  <input value={story.childName} onChange={(e) => setStory({ ...story, childName: e.target.value })} placeholder="e.g. Leo" />
                </label>
                <label className="field grow">
                  <span>Kind of story</span>
                  <select value={story.kind} onChange={(e) => setStory({ ...story, kind: e.target.value as StoryRequest['kind'] })}>
                    <option value="fun">Fun story</option>
                    <option value="social">Social story (what to expect)</option>
                  </select>
                </label>
              </div>
              <div className="row wrap">
                <label className="field grow">
                  <span>Reading level</span>
                  <select value={story.level} onChange={(e) => setStory({ ...story, level: Number(e.target.value) as StoryRequest['level'] })}>
                    <option value={1}>Easy — a few words a page</option>
                    <option value={2}>Short sentences</option>
                    <option value={3}>Longer story</option>
                  </select>
                </label>
                <label className="field grow">
                  <span>Pages: {story.pages}</span>
                  <input type="range" min={3} max={12} value={story.pages} onChange={(e) => setStory({ ...story, pages: Number(e.target.value) })} />
                </label>
              </div>
              <label className="field">
                <span>Things to include (optional)</span>
                <input value={story.include} onChange={(e) => setStory({ ...story, include: e.target.value })} placeholder="e.g. his dog Max, the color blue, trains" />
              </label>
              <button type="button" className="btn primary big-btn" disabled={!story.topic.trim() || writing || !online} onClick={write}>
                {writing ? 'Writing the story…' : drafts.length ? '✨ Write a new version' : '✨ Write the story'}
              </button>
              {!online && <p className="hint">Needs an internet connection.</p>}
            </>
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
                onCrop={d.image ? () => setCropping(d) : undefined}
                onPicture={d.image ? () => setPickingPicture(d) : undefined}
                onReread={d.image ? () => queueRead(d.id, d.image!) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {cropping?.image && (
        <CropTool
          image={cropping.image}
          onCancel={() => setCropping(null)}
          onDone={(area) => {
            queueRead(cropping.id, cropping.image!, area);
            setCropping(null);
          }}
        />
      )}

      {pickingPicture?.image && (
        <CropTool
          image={pickingPicture.image}
          title="Select the picture"
          help="Drag over the illustration on this page. It will be shown above the words in the book."
          doneLabel="Use this picture"
          onCancel={() => setPickingPicture(null)}
          onDone={async (area) => {
            const id = pickingPicture.id;
            const picture = await cropImage(pickingPicture.image!, area);
            setPickingPicture(null);
            patch(id, { picture });
          }}
        />
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
  onCrop,
  onReread,
  onPicture,
}: {
  draft: DraftPage;
  n: number;
  onText: (t: string) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onCrop?: () => void;
  onReread?: () => void;
  onPicture?: () => void;
}) {
  const url = useMemo(() => (draft.image ? URL.createObjectURL(draft.image) : null), [draft.image]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const picUrl = useMemo(() => (draft.picture ? URL.createObjectURL(draft.picture) : null), [draft.picture]);
  useEffect(() => () => void (picUrl && URL.revokeObjectURL(picUrl)), [picUrl]);
  return (
    <div className="draft">
      <div className="draft-side">
        <strong>Page {n}</strong>
        {url && <img src={url} alt={`page ${n}`} />}
        {picUrl && <img className="pic-thumb" src={picUrl} alt={`picture for page ${n}`} />}
        <div className="row">
          <button type="button" className="icon-btn" onClick={onUp} aria-label="Move up">▲</button>
          <button type="button" className="icon-btn" onClick={onDown} aria-label="Move down">▼</button>
          <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete page">🗑️</button>
        </div>
      </div>
      <div className="grow">
        {draft.status && <p className="hint">{draft.status}</p>}
        {(onCrop || onReread) && (
          <div className="row wrap">
            {onCrop && <button type="button" className="btn small" onClick={onCrop}>✂️ Select the words</button>}
            {onPicture && <button type="button" className="btn small" onClick={onPicture}>🖼️ {draft.picture ? 'Change' : 'Select'} the picture</button>}
            {onReread && <button type="button" className="btn small" onClick={onReread}>↻ Read again</button>}
          </div>
        )}
        <textarea rows={4} value={draft.text} onChange={(e) => onText(e.target.value)} placeholder="Words on this page" />
      </div>
    </div>
  );
}
