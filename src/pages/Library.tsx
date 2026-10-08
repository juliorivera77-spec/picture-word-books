import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SymbolImage } from '../components/SymbolImage';
import { createBook, SAMPLE_TEXT } from '../lib/books';
import { deleteBook, getImage, listBooks, uid } from '../lib/db';
import { useOnline, useSettings } from '../lib/settings';
import { hasArasaacIndex } from '../lib/symbols/arasaac';
import { splitPages } from '../lib/text';
import type { Book } from '../lib/types';

export function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [hasDict, setHasDict] = useState(true);
  const [busy, setBusy] = useState('');
  const online = useOnline();
  const { settings } = useSettings();
  const nav = useNavigate();

  const refresh = () => listBooks().then(setBooks);
  useEffect(() => {
    refresh();
    hasArasaacIndex().then(setHasDict);
  }, []);

  const sample = async () => {
    const drafts = splitPages(SAMPLE_TEXT).map((text) => ({ id: uid(), text }));
    const { book } = await createBook('Sam and his dog', drafts, settings, setBusy);
    setBusy('');
    nav(`/book/${book.id}`);
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>📚 Picture Word Books</h1>
        <div className="row">
          {!online && <span className="badge">Offline</span>}
          <Link className="icon-btn" to="/settings" aria-label="Settings">⚙️</Link>
        </div>
      </header>

      {!hasDict && (
        <div className="notice">
          {online ? (
            <>
              <strong>Tip:</strong> download the ARASAAC picture dictionary once, so that any word can get a picture with no internet.{' '}
              <Link to="/settings">Go to Settings → Pictures</Link>
            </>
          ) : (
            <>Offline: using the built-in Mulberry pictures. Connect once and download the ARASAAC dictionary in Settings for many more words.</>
          )}
        </div>
      )}

      <div className="book-grid">
        <Link to="/new" className="book-tile new-tile">
          <span className="big">＋</span>
          <span>New book</span>
          <small>Type, photograph or upload</small>
        </Link>
        {books?.map((b) => (
          <div key={b.id} className="book-tile">
            <Link to={`/book/${b.id}`} className="book-link">
              <Cover book={b} />
              <span className="book-title">{b.title}</span>
              <small>{b.pages.length} page{b.pages.length === 1 ? '' : 's'}</small>
            </Link>
            <button
              type="button"
              className="icon-btn del"
              aria-label={`Delete ${b.title}`}
              onClick={async () => {
                if (confirm(`Delete “${b.title}”? This cannot be undone.`)) {
                  await deleteBook(b.id);
                  refresh();
                }
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {books?.length === 0 && (
        <div className="empty">
          <p>No books yet. Make your first one, or try a short sample story.</p>
          <button type="button" className="btn" disabled={!!busy} onClick={sample}>
            {busy || 'Try a sample story'}
          </button>
        </div>
      )}
    </div>
  );
}

function Cover({ book }: { book: Book }) {
  const [scan, setScan] = useState<string | null>(null);
  const first = book.pages[0];
  useEffect(() => {
    let url: string | null = null;
    if (first?.imageId)
      getImage(first.imageId).then((img) => {
        if (img) setScan((url = URL.createObjectURL(img.blob)));
      });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [first?.imageId]);
  if (scan) return <img className="cover" src={scan} alt="" />;
  const syms = (first?.tokens ?? []).filter((t) => t.sym && t.sym !== 'none' && (t.cls === 'noun' || t.cls === 'verb')).slice(0, 4);
  return (
    <div className="cover cover-syms">
      {syms.map((t, i) => (
        <SymbolImage key={i} symbol={t.sym} alt="" />
      ))}
    </div>
  );
}
