import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SymbolImage } from '../components/SymbolImage';
import { deleteBook, getImage, listBooks } from '../lib/db';
import { CATEGORIES, COLLECTION, LEVELS, type Category, type CollectionBook } from '../lib/library';
import { useOnline } from '../lib/settings';
import type { Book } from '../lib/types';

const CATEGORY_ICON: Record<Category, string> = { first: '🔤', story: '📖', social: '🧩', rhyme: '🎵' };
const FILTER_KEY = 'pwb-collection-filter';

export function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [filter, setFilter] = useState<Category | 'all'>(() => {
    try {
      return (localStorage.getItem(FILTER_KEY) as Category | 'all') || 'all';
    } catch {
      return 'all';
    }
  });
  const [confirmDelete, setConfirmDelete] = useState<Book | null>(null);
  const online = useOnline();

  const refresh = () => listBooks().then(setBooks);
  useEffect(() => {
    refresh();
  }, []);

  const pickFilter = (f: Category | 'all') => {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* ignore */
    }
  };

  const added = useMemo(() => new Set((books ?? []).map((b) => b.source?.id).filter(Boolean)), [books]);
  const shown = COLLECTION.filter((b) => filter === 'all' || b.category === filter).sort((a, b) => a.level - b.level);

  return (
    <div className="page">
      <header className="topbar">
        <h1>📚 Picture Word Books</h1>
        <div className="row">
          {!online && <span className="badge">Offline</span>}
          <Link className="icon-btn" to="/settings" aria-label="Settings">⚙️</Link>
        </div>
      </header>

      <section>
        <h2 className="section-title">My books</h2>
        <div className="book-grid">
          <Link to="/new" className="book-tile new-tile">
            <span className="big">＋</span>
            <span>Make a book</span>
            <small>Type, dictate, photograph, or write one with AI</small>
          </Link>
          {books?.map((b) => (
            <div key={b.id} className="book-tile">
              <Link to={`/book/${b.id}`} className="book-link">
                <Cover book={b} />
                <span className="book-title">{b.title}</span>
                <small>{b.pages.length} page{b.pages.length === 1 ? '' : 's'}</small>
              </Link>
              <button type="button" className="icon-btn del" aria-label={`Delete ${b.title}`} onClick={() => setConfirmDelete(b)}>
                🗑️
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Book collection</h2>
        <p className="hint">Free books, ready to read. Tap one to add it to My books.</p>
        <div className="chips" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} className={`chip ${filter === c.id ? 'on' : ''}`} onClick={() => pickFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="book-grid">
          {shown.map((b) => (
            <Link key={b.id} to={`/collection/${b.id}`} className="book-tile book-link">
              <CollectionCover book={b} />
              <span className="book-title">{b.title}</span>
              <small>
                {LEVELS[b.level]}
                {added.has(b.id) ? ' · ✓ added' : ''}
              </small>
            </Link>
          ))}
        </div>
      </section>

      {confirmDelete && (
        <div className="modal-back" onClick={() => setConfirmDelete(null)}>
          <div className="modal small-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <p>Delete “{confirmDelete.title}” from My books? This cannot be undone.</p>
              <div className="row end">
                <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    await deleteBook(confirmDelete.id);
                    setConfirmDelete(null);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CollectionCover({ book }: { book: CollectionBook }) {
  const img = book.cover ?? book.pages.find((p) => p.image)?.image;
  if (img) return <img className="cover" src={`${import.meta.env.BASE_URL}${img}`} alt="" loading="lazy" />;
  return (
    <div className={`cover cover-icon cat-${book.category}`} aria-hidden>
      <span>{CATEGORY_ICON[book.category]}</span>
    </div>
  );
}

function Cover({ book }: { book: Book }) {
  const [scan, setScan] = useState<string | null>(null);
  const first = book.pages.find((p) => p.imageId) ?? book.pages[0];
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
  const syms = (book.pages[0]?.tokens ?? []).filter((t) => t.sym && t.sym !== 'none' && (t.cls === 'noun' || t.cls === 'verb')).slice(0, 4);
  return (
    <div className="cover cover-syms">
      {syms.map((t, i) => (
        <SymbolImage key={i} symbol={t.sym} alt="" />
      ))}
    </div>
  );
}
