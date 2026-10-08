import { getAllWordPrefs, getImage } from '../db';
import type { Settings, SymbolRef, Token } from '../types';
import { arasaacUrl, cacheArasaac, hasArasaacIndex, lookupArasaac } from './arasaac';
import { lookupMulberry, mulberryUrl } from './mulberry';

// ---------- displaying a picture ----------
const urlCache = new Map<SymbolRef, Promise<string | null>>();

export function symbolUrl(ref: SymbolRef): Promise<string | null> {
  let p = urlCache.get(ref);
  if (!p) {
    p = loadUrl(ref).catch(() => null);
    urlCache.set(ref, p);
  }
  return p;
}

/** Forget a cached URL (e.g. after the stored image changed). */
export function forgetSymbolUrl(ref: SymbolRef) {
  urlCache.delete(ref);
}

async function loadUrl(ref: SymbolRef): Promise<string | null> {
  const [kind, ...rest] = ref.split(':');
  const id = rest.join(':');
  if (kind === 'm') return (await mulberryUrl(id)) ?? null;
  if (kind === 'a') return arasaacUrl(Number(id));
  if (kind === 'u') {
    const img = await getImage(ref);
    return img ? URL.createObjectURL(img.blob) : null;
  }
  return null;
}

// ---------- finding a picture for a word ----------
type Source = Settings['sourceOrder'][number];

async function lookupIn(source: Source, word: string): Promise<SymbolRef | null> {
  if (source === 'mulberry') {
    const names = await lookupMulberry(word).catch(() => []);
    return names.length ? `m:${names[0]}` : null;
  }
  const ids = await lookupArasaac(word);
  return ids.length ? `a:${ids[0]}` : null;
}

/** All candidate pictures for a word (used by the picker), best first. */
export async function candidatesFor(words: string[], order: Source[]): Promise<SymbolRef[]> {
  const out: SymbolRef[] = [];
  for (const w of words) {
    for (const s of order) {
      if (s === 'mulberry') out.push(...(await lookupMulberry(w).catch(() => [])).map((n) => `m:${n}`));
      else out.push(...(await lookupArasaac(w)).slice(0, 12).map((id) => `a:${id}`));
    }
  }
  return [...new Set(out)];
}

export interface MatchResult {
  missing: string[];
  /** Pictures that could not be saved for offline use (no connection). */
  notCached: number;
}

/**
 * Give every token a picture. Order of preference:
 *   1. the picture the user chose for this word before
 *   2. multi-word phrases ("ice cream", "teddy bear") in the offline dictionaries
 *   3. the word itself, then its base form / synonyms, in each library in the preferred order
 */
export async function matchTokens(
  pages: Token[][],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<MatchResult> {
  const prefs = await getAllWordPrefs();
  const order = settings.sourceOrder;
  const arasaacOffline = await hasArasaacIndex();
  const wordCache = new Map<string, SymbolRef | null>();

  const findWord = async (t: Token): Promise<SymbolRef | null> => {
    if (prefs.has(t.key)) return prefs.get(t.key)!;
    if (wordCache.has(t.key)) return wordCache.get(t.key)!;
    let found: SymbolRef | null = null;
    outer: for (const w of [t.key, ...t.alts]) {
      if (prefs.has(w)) {
        found = prefs.get(w)!;
        break;
      }
      for (const s of order) {
        found = await lookupIn(s, w);
        if (found) break outer;
      }
    }
    wordCache.set(t.key, found);
    return found;
  };

  const findPhrase = async (phrase: string): Promise<SymbolRef | null> => {
    if (prefs.has(phrase)) return prefs.get(phrase)!;
    for (const s of order) {
      if (s === 'arasaac' && !arasaacOffline) continue; // avoid a web request for every word pair
      const r = await lookupIn(s, phrase);
      if (r) return r;
    }
    return null;
  };

  // Clear earlier automatic phrase joins; keep phrases the user picked by hand.
  for (const tokens of pages)
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.manual && t.span) {
        i += t.span;
        continue;
      }
      t.joined = false;
      if (!t.manual) t.span = undefined;
    }

  const total = pages.reduce((n, p) => n + p.length, 0);
  let done = 0;
  for (const tokens of pages) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      onProgress?.(++done, total);
      if (t.manual || t.joined) continue;
      let matched = false;
      for (const n of [3, 2]) {
        const group = tokens.slice(i, i + n);
        if (group.length < n || group.some((g) => g.manual)) continue;
        // Only join words that sit next to each other with plain spaces between them.
        if (group.slice(0, -1).some((g, j) => !/^ +$/.test(g.post + group[j + 1].pre))) continue;
        const sym = await findPhrase(group.map((g) => g.key).join(' '));
        if (sym) {
          t.sym = sym;
          t.span = n - 1;
          for (const g of group.slice(1)) {
            g.joined = true;
            g.sym = null;
          }
          i += n - 1;
          done += n - 1;
          matched = true;
          break;
        }
      }
      if (!matched) t.sym = await findWord(t);
    }
  }

  const missing = new Set<string>();
  const arasaacIds = new Set<number>();
  for (const tokens of pages)
    for (const t of tokens) {
      if (t.joined) continue;
      if (!t.sym) missing.add(t.key);
      else if (t.sym.startsWith('a:')) arasaacIds.add(Number(t.sym.slice(2)));
    }
  const notCached = await cacheAll([...arasaacIds]);
  return { missing: [...missing], notCached };
}

/** Save ARASAAC pictures to the device so the book works offline. */
export async function cacheAll(ids: number[]): Promise<number> {
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < ids.length) if (!(await cacheArasaac(ids[next++]))) failed++;
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return failed;
}

/** Split a joined phrase back into separate words. */
export function unjoin(tokens: Token[], i: number) {
  const t = tokens[i];
  for (let j = 1; j <= (t.span ?? 0); j++) {
    const g = tokens[i + j];
    if (g) g.joined = false;
  }
  t.span = undefined;
}
