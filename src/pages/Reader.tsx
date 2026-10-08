import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Modal, SymbolPicker, type PickResult } from '../components/SymbolPicker';
import { WordCard } from '../components/WordCard';
import { generateMissing, retokenizePage } from '../lib/books';
import { getBook, getImage, saveBook, setWordPref } from '../lib/db';
import { useOnline, useSettings } from '../lib/settings';
import { speak, stopSpeaking } from '../lib/speech';
import { cacheArasaac } from '../lib/symbols/arasaac';
import { candidatesFor, unjoin } from '../lib/symbols/resolver';
import { tokensToText } from '../lib/text';
import type { Book, Page, Token } from '../lib/types';

interface Group {
  index: number;
  tokens: Token[];
  lineBreak: boolean;
}

function groupsOf(page: Page): Group[] {
  const out: Group[] = [];
  const t = page.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].joined) continue;
    const tokens = t.slice(i, i + 1 + (t[i].span ?? 0));
    const lineBreak = i > 0 && (/\n/.test(t[i - 1].post) || /\n/.test(t[i].pre));
    out.push({ index: i, tokens, lineBreak });
  }
  return out;
}

const phraseOf = (g: Token[]) => g.map((t, i) => (i ? t.pre : '') + t.text + (i < g.length - 1 ? t.post : '')).join('');

export function Reader() {
  const { id } = useParams();
  const { settings } = useSettings();
  const online = useOnline();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [pageNo, setPageNo] = useState(0);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [printing, setPrinting] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    getBook(id!).then((b) => {
      setBook(b ?? null);
      const saved = Number(localStorage.getItem(`pwb-pos-${id}`) ?? 0);
      if (b && saved < b.pages.length) setPageNo(saved);
    });
    return stopSpeaking;
  }, [id]);

  const page = book?.pages[pageNo];
  const groups = useMemo(() => (page ? groupsOf(page) : []), [page, book]);
  const refresh = () => setBook((b) => (b ? { ...b } : b));

  useEffect(() => {
    let url: string | null = null;
    setScanUrl(null);
    if (page?.imageId)
      getImage(page.imageId).then((img) => {
        if (img) setScanUrl((url = URL.createObjectURL(img.blob)));
      });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [page?.imageId]);

  const go = useCallback(
    (n: number) => {
      if (!book) return;
      const next = Math.max(0, Math.min(book.pages.length - 1, n));
      stopSpeaking();
      setReading(false);
      setActive(null);
      setPageNo(next);
      try {
        localStorage.setItem(`pwb-pos-${book.id}`, String(next));
      } catch {
        /* ignore */
      }
    },
    [book],
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (picking !== null || editText !== null) return;
      if (e.key === 'ArrowRight') go(pageNo + 1);
      if (e.key === 'ArrowLeft') go(pageNo - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go, pageNo, picking, editText]);

  if (book === undefined) return <div className="page"><p className="hint">Opening…</p></div>;
  if (book === null || !page)
    return (
      <div className="page">
        <p>This book could not be found.</p>
        <Link to="/" className="btn">Back to my books</Link>
      </div>
    );

  const readPage = () => {
    if (reading) {
      stopSpeaking();
      setReading(false);
      setActive(null);
      return;
    }
    // Map character positions back to word cards so each card lights up as it is read.
    let text = '';
    const starts: { at: number; group: number }[] = [];
    groups.forEach((g) => {
      g.tokens.forEach((t, j) => {
        text += t.pre;
        if (j === 0) starts.push({ at: text.length, group: g.index });
        text += t.text + t.post;
      });
    });
    setReading(true);
    speak(text, {
      voiceURI: settings.voiceURI,
      rate: settings.speechRate,
      onBoundary: (ci) => {
        let cur = starts[0]?.group ?? null;
        for (const s of starts) if (s.at <= ci) cur = s.group;
        setActive(cur);
      },
      onEnd: () => {
        setReading(false);
        setActive(null);
      },
    });
  };

  const tapCard = (g: Group) => {
    if (editing) return setPicking(g.index);
    setActive(g.index);
    speak(phraseOf(g.tokens), { voiceURI: settings.voiceURI, rate: settings.speechRate, onEnd: () => setActive(null) });
  };

  const pick = async ({ sym, always }: PickResult) => {
    const i = picking!;
    const head = page.tokens[i];
    const group = page.tokens.slice(i, i + 1 + (head.span ?? 0));
    const key = group.map((t) => t.key).join(' ');
    head.sym = sym;
    head.manual = true;
    if (always) {
      await setWordPref(key, sym);
      // Use the new picture for the same word everywhere in this book.
      for (const p of book.pages)
        for (const t of p.tokens) if (t !== head && !t.joined && !t.span && t.key === key) t.sym = sym;
    }
    setPicking(null);
    refresh();
    if (sym.startsWith('a:')) await cacheArasaac(Number(sym.slice(2)));
    await saveBook(book);
  };

  const fixWord = async (text: string) => {
    const i = picking!;
    const tokens = page.tokens.map((t, j) => (j === i ? { ...t, text } : t));
    setPicking(null);
    setStatus('Updating…');
    await retokenizePage(book, pageNo, tokensToText(tokens), settings);
    setStatus('');
    refresh();
  };

  const split = async () => {
    const i = picking!;
    const group = page.tokens.slice(i, i + 1 + (page.tokens[i].span ?? 0));
    unjoin(page.tokens, i);
    for (const t of group) {
      t.sym = (await candidatesFor([t.key, ...t.alts], settings.sourceOrder))[0] ?? null;
      t.manual = true; // keep these as single words
    }
    setPicking(null);
    refresh();
    await saveBook(book);
  };

  const saveText = async () => {
    if (editText === null) return;
    setStatus('Finding pictures…');
    await retokenizePage(book, pageNo, editText, settings);
    setEditText(null);
    setStatus('');
    refresh();
  };

  const missingWords = [...new Set(book.pages.flatMap((p) => p.tokens.filter((t) => !t.sym && !t.joined).map((t) => t.key)))];

  const aiAll = async () => {
    const errors = await generateMissing(book, settings, setStatus);
    setStatus(errors.length ? `Some pictures failed: ${errors[0]}` : '');
    refresh();
  };

  const print = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 1200);
  };

  const picked = picking !== null ? page.tokens[picking] : null;

  return (
    <div className={`reader ${editing ? 'is-editing' : ''}`}>
      <header className="topbar reader-bar no-print">
        <Link to="/" className="icon-btn" aria-label="My books">←</Link>
        <h1 className="ellipsis">{book.title}</h1>
        <div className="row">
          <button type="button" className={`btn ${reading ? 'primary' : ''}`} onClick={readPage}>
            {reading ? '⏹ Stop' : '🔊 Read'}
          </button>
          <button type="button" className={`btn ${editing ? 'primary' : ''}`} onClick={() => setEditing((e) => !e)}>
            {editing ? '✓ Done' : '✏️ Edit'}
          </button>
        </div>
      </header>

      {editing && (
        <div className="notice no-print">
          Tap any picture to change it. You can also{' '}
          <button type="button" className="link" onClick={() => setEditText(page.text)}>edit this page’s words</button>,{' '}
          <button type="button" className="link" onClick={print}>print the book</button>
          {scanUrl && (
            <>
              , or{' '}
              <button type="button" className="link" onClick={() => setShowScan((s) => !s)}>
                {showScan ? 'hide' : 'show'} the original page photo
              </button>
            </>
          )}
          .
        </div>
      )}

      {missingWords.length > 0 && editing && (
        <div className="notice warn no-print">
          {missingWords.length} word{missingWords.length === 1 ? '' : 's'} without a picture: <em>{missingWords.slice(0, 12).join(', ')}{missingWords.length > 12 ? '…' : ''}</em>
          {settings.aiEnabled && settings.aiKey && (
            <button type="button" className="btn small" disabled={!online || !!status} onClick={aiAll}>
              ✨ Make AI pictures{!online ? ' (needs internet)' : ''}
            </button>
          )}
        </div>
      )}
      {status && <p className="hint center no-print">{status}</p>}

      <main
        className="book-page no-print"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 70) go(pageNo + (dx < 0 ? 1 : -1));
        }}
      >
        {showScan && scanUrl && <img className="scan" src={scanUrl} alt="original page" />}
        <PageCards groups={groups} settings={settings} active={active} editing={editing} onTap={tapCard} />
      </main>

      <footer className="pager no-print">
        <button type="button" className="nav-btn" disabled={pageNo === 0} onClick={() => go(pageNo - 1)} aria-label="Previous page">◀</button>
        <span>
          Page {pageNo + 1} of {book.pages.length}
        </span>
        <button type="button" className="nav-btn" disabled={pageNo >= book.pages.length - 1} onClick={() => go(pageNo + 1)} aria-label="Next page">▶</button>
      </footer>

      {printing && (
        <div className="print-only">
          <h1>{book.title}</h1>
          {book.pages.map((p) => (
            <section key={p.id} className="print-page">
              <PageCards groups={groupsOf(p)} settings={settings} active={null} editing={false} onTap={() => {}} />
            </section>
          ))}
          <p className="credits">Pictograms: ARASAAC (arasaac.org, CC BY-NC-SA) and Mulberry Symbols (CC BY-SA).</p>
        </div>
      )}

      {picked && (
        <SymbolPicker
          token={picked}
          phrase={phraseOf(page.tokens.slice(picking!, picking! + 1 + (picked.span ?? 0)))}
          sentence={page.text}
          settings={settings}
          onPick={pick}
          onFixWord={fixWord}
          onSplit={picked.span ? split : undefined}
          onClose={() => setPicking(null)}
        />
      )}

      {editText !== null && (
        <Modal title={`Page ${pageNo + 1} words`} onClose={() => setEditText(null)}>
          <textarea rows={8} value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div className="row end">
            <button type="button" className="btn" onClick={() => setEditText(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={!!status} onClick={saveText}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PageCards({
  groups,
  settings,
  active,
  editing,
  onTap,
}: {
  groups: Group[];
  settings: ReturnType<typeof useSettings>['settings'];
  active: number | null;
  editing: boolean;
  onTap: (g: Group) => void;
}) {
  return (
    <div className="cards">
      {groups.map((g) => (
        <Fragment key={g.index}>
          {g.lineBreak && <span className="line-break" />}
          <WordCard group={g.tokens} settings={settings} active={active === g.index} editing={editing} onTap={() => onTap(g)} />
        </Fragment>
      ))}
    </div>
  );
}
