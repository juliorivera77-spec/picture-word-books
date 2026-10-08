# Picture Word Books

Turn any children’s book into a **symbol-supported book**: every word is shown with an
AAC picture symbol above it, in the style used with autistic and minimally-verbal readers.

Works on iPad, iPhone, Android and computers as an installable web app, and **works fully
offline** once installed.

## What it does

- **Add a book three ways**
  - 📷 **Photos of pages** — the words are read from the photo on the device (Tesseract OCR, no internet needed). You can check and fix the text before making the book.
  - ✍️ **Type or paste** — a blank line starts a new page.
  - 📄 **Upload a file** — PDF (scanned PDFs are OCR’d), EPUB, plain text, or images.
- **A picture for every word**, matched automatically:
  1. the picture you chose for that word before (remembered across all books)
  2. multi-word symbols such as “ice cream” or “teddy bear”
  3. the word itself, then its base form (“ran” → run, “mice” → mouse, “bigger” → big, “Bear’s” → bear) and kid-word synonyms (“mommy” → mum)
- **Two free symbol sets**
  - **Mulberry** (~3,400 symbols, CC BY-SA) — built into the app.
  - **ARASAAC** (~13,000 pictograms, CC BY-NC-SA) — download the word list once in *Settings → Pictures*; the pictures each book needs are saved to the device when the book is made, so the book then works offline.
- **Fix anything**: in *Edit* mode tap a word to pick another symbol, search, take a photo, draw your own, make an AI picture, or fix a word the camera misread.
- **AI pictures (optional, online only)** for words with no symbol, using your own OpenAI API key. Finished pictures are stored and work offline.
- **Read aloud** with word-by-word highlighting, using the device’s own voices; tap a single card to hear one word.
- **Display options**: picture size, word size, word above/below, upper/lower case, and colour-coding by word type (Modified Fitzgerald Key).
- **Print** a book, and **backup/restore** all books to a file.

## Running it

```bash
cd picture-books
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm test          # unit tests
```

`npm run dev` and `npm run build` copy the OCR engine and English language data from
`node_modules` into `public/ocr/` so photo reading works without internet.

### Installing on a tablet or phone

Host the `dist/` folder on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages…).
The workflow in `.github/workflows/picture-books-pages.yml` publishes it to GitHub Pages.
Then open the site once and:

- **iPad/iPhone (Safari)**: Share → *Add to Home Screen*.
- **Android (Chrome)**: menu → *Install app*.

Opening the app once caches everything (about 16 MB compressed). After that it works offline.
For the full ARASAAC vocabulary offline, open *Settings → Pictures* while online and tap
*Download word list*.

## How it’s built

- React + TypeScript + Vite, with `vite-plugin-pwa` (Workbox) for the offline service worker.
- Books, pictures and preferences are stored in IndexedDB on the device; nothing is uploaded.
- `compromise` for word forms and parts of speech; `tesseract.js` for OCR; `pdfjs-dist` and `jszip` for PDF/EPUB.
- `public/symbols/mulberry/` holds the Mulberry set, packed into small JSON shards plus a word index.
  Regenerate with `node scripts/build-mulberry.mjs /path/to/mulberry-symbols` (from
  https://github.com/mulberrysymbols/mulberry-symbols).

## Licences

- ARASAAC pictograms: © Government of Aragón, author Sergio Palao, origin ARASAAC
  (https://arasaac.org), licence CC BY-NC-SA 4.0. **Not for commercial use.**
- Mulberry Symbols: © Steve Lee, licence CC BY-SA 4.0 (see `public/symbols/mulberry/LICENSE.txt`).
- PECS® and Boardmaker/PCS symbols are proprietary and not included.
