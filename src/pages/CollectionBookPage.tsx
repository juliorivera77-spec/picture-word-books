import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addFromCollection, findCollectionCopy } from '../lib/books';
import { collectionBook, LEVELS } from '../lib/library';
import { useSettings } from '../lib/settings';
import type { Book } from '../lib/types';
import { CollectionCover } from './Library';

/** Preview of a book in the collection, with a button to add it to My books and read it. */
export function CollectionBookPage() {
  const { id } = useParams();
  const book = collectionBook(id ?? '');
  const { settings } = useSettings();
  const nav = useNavigate();
  const [copy, setCopy] = useState<Book | undefined>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (book) findCollectionCopy(book.id).then(setCopy);
  }, [book]);

  if (!book)
    return (
      <div className="page">
        <p>This book could not be found.</p>
        <Link to="/" className="btn">Back</Link>
      </div>
    );

  const read = async () => {
    setError('');
    try {
      const b = copy ?? (await addFromCollection(book, settings, setStatus));
      nav(`/book/${b.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    }
  };

  const words = book.pages.map((p) => p.text).join(' ').split(/\s+/).filter(Boolean).length;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back">←</Link>
        <h1 className="ellipsis">{book.title}</h1>
        <span />
      </header>
      <div className="preview">
        <div className="preview-cover">
          <CollectionCover book={book} />
        </div>
        <div className="grow">
          <p className="preview-desc">{book.description}</p>
          <p className="hint">
            {LEVELS[book.level]} · {book.pages.length} pages · {words} words
          </p>
          <button type="button" className="btn primary big-btn" disabled={!!status} onClick={read}>
            {status || (copy ? 'Open my copy' : 'Add to My books and read')}
          </button>
          {error && <p className="error">{error}</p>}
          {!copy && !status && <p className="hint">Pictures are added for every word. After that the book works without internet.</p>}
        </div>
      </div>
      <h2 className="section-title">First page</h2>
      <p className="preview-text">{book.pages[0]?.text}</p>
      <p className="credit">
        {book.credit}
        {book.url && (
          <>
            {' '}
            <a href={book.url} target="_blank" rel="noreferrer">More about this book</a>
          </>
        )}
      </p>
    </div>
  );
}
