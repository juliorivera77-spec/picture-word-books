import { useState } from 'react';

const KEY = 'pwb-guide-closed';

function initiallyOpen() {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

/** The "How to use" guide at the top of the home screen. Open until the reader hides it; ❓ brings it back. */
export function useGuide() {
  const [open, setOpen] = useState(initiallyOpen);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(KEY, v ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  return [open, set] as const;
}

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <section className="guide" aria-label="How to use this app">
      <div className="guide-head">
        <h2>How to use Picture Word Books</h2>
        <button type="button" className="btn small" onClick={onClose}>Hide</button>
      </div>
      <p>
        This app turns any children’s book into a picture-supported book: every word gets a picture symbol above it, like PECS
        cards, so a child can follow the story word by word.
      </p>

      <h3>Make a book</h3>
      <ol>
        <li>Tap <strong>＋ New book</strong> and type a title.</li>
        <li>
          Tap <strong>✍️ Type or paste</strong>, tap the big text box, then tap the <strong>🎤 microphone</strong> on your keyboard and
          read the book out loud. To start a new page, stop the microphone and press <strong>return twice</strong> (an empty line =
          new page). Check for misheard words before going on.
          <br />
          <span className="hint">Or use 📷 Photos of pages to photograph each page, or 📄 Upload a file (PDF or e-book).</span>
        </li>
        <li>Tap <strong>Make picture book ✨</strong>. Each word gets a picture; phrases like “on top of” share one picture.</li>
      </ol>

      <h3>Fill in blank pictures (free)</h3>
      <ol>
        <li>
          In the book, tap <strong>🧩 Fill in the blanks</strong>. It opens each word without a picture, one after another.
        </li>
        <li>
          For each word, do one of these:
          <ul>
            <li><strong>Search</strong> a similar word (e.g. “puppy” → search “dog”) and tap a picture.</li>
            <li><strong>📷 Take photo</strong> of the real thing — great for names, family, pets and favourite toys.</li>
            <li><strong>✏️ Draw</strong> a quick picture with your finger.</li>
            <li>
              <strong>Use ChatGPT</strong> (the free version can make pictures): tap <strong>📋 Copy ChatGPT request</strong>, paste it
              into ChatGPT, save the picture it makes to your Photos, come back and tap <strong>🖼️ Choose image</strong>.
            </li>
          </ul>
        </li>
        <li>
          Leave <strong>“Always use this picture”</strong> ticked. Then you only fill a word once — every future book uses your picture
          automatically.
        </li>
      </ol>

      <h3>Read together</h3>
      <ul>
        <li><strong>🔊 Read</strong> reads the page aloud and lights up each word. Tap any card to hear just that word.</li>
        <li>Swipe or use ◀ ▶ to turn pages. The app remembers the page you were on.</li>
        <li>To change a picture or fix a word later: tap <strong>✏️ Edit</strong>, then tap the card.</li>
      </ul>

      <h3>Tips for best results</h3>
      <ul>
        <li>
          Once, while online: <strong>⚙️ Settings → Pictures → Download word list</strong>. It adds about 13,000 more pictures and
          means far fewer blanks.
        </li>
        <li>Short pages (one or two sentences) are easier for new readers.</li>
        <li>Change picture size, word size and word colours in <strong>⚙️ Settings → Display</strong>.</li>
        <li>After it has been opened once, the app works without internet.</li>
        <li>
          The <strong>AI helper</strong> in Settings is optional and is paid through your own OpenAI account. You do not need it — the
          free ways above work well.
        </li>
      </ul>

      <h3>Sharing with a teacher or another device</h3>
      <ul>
        <li>Send them the app link. Each phone or tablet keeps its own books.</li>
        <li>
          To give them your finished books: <strong>⚙️ Settings → Backup → Share backup</strong> and send the file (Messages, email,
          AirDrop). They open the app and tap <strong>Settings → Backup → Restore backup</strong>. Your pictures come with the books.
        </li>
      </ul>
    </section>
  );
}
