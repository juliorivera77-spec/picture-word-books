import { aiReady, generatePicture, readSentences } from './ai';
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
): Promise<{ book: Book; result: MatchResult; aiError?: string }> {
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
  const aiError = await aiReadSentences(book, settings, onStatus);
  onStatus('Finding pictures…');
  const result = await matchTokens(
    book.pages.map((p) => p.tokens),
    settings,
    (done, total) => onStatus(`Finding pictures… ${Math.round((100 * done) / Math.max(1, total))}%`),
  );
  onStatus('Saving…');
  await saveBook(book);
  return { book, result, aiError };
}

/** Let the AI read whole sentences to pick each word's meaning. Returns an error message if it could not. */
async function aiReadSentences(book: Book, settings: Settings, onStatus: (s: string) => void, pages = book.pages) {
  if (!settings.aiContext || !aiReady(settings)) return undefined;
  try {
    await readSentences(pages, settings, onStatus);
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}

/** Re-check the whole book with AI: read every sentence again, re-pick pictures, then draw any still missing. */
export async function improveWithAI(book: Book, settings: Settings, onStatus: (s: string) => void): Promise<string[]> {
  const errors: string[] = [];
  const err = await aiReadSentences(book, { ...settings, aiContext: true }, onStatus);
  if (err) return [err];
  onStatus('Finding better pictures…');
  await matchTokens(
    book.pages.map((p) => p.tokens),
    settings,
  );
  await saveBook(book);
  errors.push(...(await generateMissing(book, settings, onStatus)));
  return errors;
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
  await aiReadSentences(book, settings, () => {}, [page]);
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
  // One picture per meaning: "top" (position) and "top" (shirt) are drawn separately.
  const missing = new Map<string, { word: string; sentence: string; draw?: string }>();
  for (const p of book.pages)
    for (const t of p.tokens) {
      const meaning = t.concept ?? t.key;
      if (!t.sym && !t.joined && !missing.has(meaning)) missing.set(meaning, { word: t.text, sentence: p.text, draw: t.draw });
    }
  const errors: string[] = [];
  let n = 0;
  for (const [meaning, m] of missing) {
    onStatus(`Drawing “${m.word}” with AI (${++n} of ${missing.size})…`);
    try {
      const ref = await generatePicture(m.word, m.sentence, settings, m.draw);
      await setWordPref(meaning, ref);
      for (const p of book.pages) for (const t of p.tokens) if ((t.concept ?? t.key) === meaning && !t.sym && !t.joined) t.sym = ref;
      await saveBook(book);
    } catch (e) {
      errors.push((e as Error).message);
      // Stop on problems that will affect every picture (key, credit, connection).
      if (/key|credit|billing|internet|reach/i.test((e as Error).message)) break;
    }
  }
  await saveBook(book);
  onStatus('');
  return errors;
}
