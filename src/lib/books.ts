import { generatePicture } from './ai';
import { putImage, saveBook, setWordPref, uid } from './db';
import { shrinkImage } from './images';
import { matchTokens, type MatchResult } from './symbols/resolver';
import { tokenize } from './text';
import type { Book, DraftPage, Settings } from './types';

/** Turn draft pages into a picture book: split into words, find a picture for each, save for offline use. */
export async function createBook(
  title: string,
  drafts: DraftPage[],
  settings: Settings,
  onStatus: (s: string) => void,
): Promise<{ book: Book; result: MatchResult }> {
  const book: Book = { id: uid(), title: title.trim() || 'My book', createdAt: Date.now(), updatedAt: Date.now(), pages: [] };
  for (const d of drafts) {
    if (!d.text.trim() && !d.image) continue;
    let imageId: string | undefined;
    if (d.image) {
      imageId = `s:${uid()}`;
      await putImage(imageId, await shrinkImage(d.image, 1400, 'image/jpeg', 0.8), 'scan');
    }
    book.pages.push({ id: uid(), text: d.text.trim(), tokens: tokenize(d.text.trim()), imageId });
  }
  onStatus('Finding pictures…');
  const result = await matchTokens(
    book.pages.map((p) => p.tokens),
    settings,
    (done, total) => onStatus(`Finding pictures… ${Math.round((100 * done) / Math.max(1, total))}%`),
  );
  onStatus('Saving…');
  await saveBook(book);
  return { book, result };
}

/** Re-read a page after its text was edited, keeping pictures the user picked by hand for the same words. */
export async function retokenizePage(book: Book, pageIndex: number, text: string, settings: Settings) {
  const page = book.pages[pageIndex];
  const manual = new Map(page.tokens.filter((t) => t.manual && !t.span).map((t) => [t.key, t.sym]));
  page.text = text.trim();
  page.tokens = tokenize(page.text);
  for (const t of page.tokens) {
    if (manual.has(t.key)) {
      t.sym = manual.get(t.key)!;
      t.manual = true;
    }
  }
  const result = await matchTokens([page.tokens], settings);
  await saveBook(book);
  return result;
}

export const SAMPLE_TEXT = `Sam has a little red ball.
He likes to play with his dog.

The dog runs fast. Sam runs too!
They play in the park.

Sam is hungry. He eats an apple.
The dog drinks some water.

The sun goes down.
Sam and his dog go home to sleep.`;

/** Make AI pictures for every word in the book that has none. Each picture is remembered for that word in all books. */
export async function generateMissing(book: Book, settings: Settings, onStatus: (s: string) => void): Promise<string[]> {
  const missing = new Map<string, string>(); // word -> example sentence
  for (const p of book.pages) for (const t of p.tokens) if (!t.sym && !t.joined && !missing.has(t.key)) missing.set(t.key, p.text);
  const errors: string[] = [];
  let n = 0;
  for (const [word, sentence] of missing) {
    onStatus(`Drawing “${word}” with AI (${++n} of ${missing.size})…`);
    try {
      const ref = await generatePicture(word, sentence, settings);
      await setWordPref(word, ref);
      for (const p of book.pages) for (const t of p.tokens) if (t.key === word && !t.sym && !t.joined) t.sym = ref;
    } catch (e) {
      errors.push(`${word}: ${(e as Error).message}`);
      if (/key|auth|quota|billing|internet/i.test((e as Error).message)) break;
    }
  }
  await saveBook(book);
  return errors;
}
