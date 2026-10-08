import { PHRASES, phraseAt, senseFor } from '../context';
import { getAllWordPrefs, getImage } from '../db';
import type { Settings, SymbolRef, Token } from '../types';
import { arasaacUrl, cacheArasaac, hasArasaacIndex, lookupArasaac } from './arasaac';
import { coreUrl, lookupCore } from './core';
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
  if (kind === 'c') return coreUrl(id);
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

/** Mulberry action symbols are named "eat_,_to"; prefer the kind that matches how the word is used. */
function mulberryByClass(names: string[], cls?: string) {
  if (!cls || names.length < 2) return names;
  const isVerb = (n: string) => n.includes('_,_to');
  const want = cls === 'verb';
  const good = names.filter((n) => isVerb(n) === want);
  return good.length ? [...good, ...names.filter((n) => isVerb(n) !== want)] : names;
}

async function lookupIn(source: Source, word: string, cls?: string, strict = false): Promise<SymbolRef | null> {
  if (source === 'mulberry') {
    let names = mulberryByClass(await lookupMulberry(word).catch(() => []), cls);
    // A noun should not get an action picture ("the park" is not "to park a car").
    if (strict && cls && cls !== 'verb') names = names.filter((n) => !n.includes('_,_to'));
    return names.length ? `m:${names[0]}` : null;
  }
  const ids = await lookupArasaac(word, cls);
  return ids.length ? `a:${ids[0]}` : null;
}

/** A word to look up, or a fixed picture ("m:on", "c:by.svg"). */
async function resolveTarget(target: string, order: Source[], cls?: string): Promise<SymbolRef | null> {
  if (/^[cma]:/.test(target)) return target;
  const core = lookupCore(target);
  if (core) return `c:${core}`;
  for (const s of order) {
    const r = await lookupIn(s, target, cls);
    if (r) return r;
  }
  return null;
}

/** All candidate pictures for a word (used by the picker), best first. */
export async function candidatesFor(words: string[], order: Source[], cls?: string): Promise<SymbolRef[]> {
  const out: SymbolRef[] = [];
  for (const w of words) {
    const core = lookupCore(w);
    if (core) out.push(`c:${core}`);
    for (const s of order) {
      if (s === 'mulberry') out.push(...mulberryByClass(await lookupMulberry(w).catch(() => []), cls).map((n) => `m:${n}`));
      else out.push(...(await lookupArasaac(w, cls)).slice(0, 12).map((id) => `a:${id}`));
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
 *   2. the meaning the AI sentence reader found for this word ("top" → "on top")
 *   3. multi-word phrases ("on top of", "ice cream", "thank you")
 *   4. context rules for words with several meanings (top, park, saw, watch, can, like…)
 *   5. built-in core pictures for little words (is, not, the, he…)
 *   6. the word, then its base form / synonyms, in each library — preferring pictures of the same word class
 */
export async function matchTokens(
  pages: Token[][],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<MatchResult> {
  const prefs = await getAllWordPrefs();
  const order = settings.sourceOrder;
  const arasaacOffline = await hasArasaacIndex();
  const cache = new Map<string, SymbolRef | null>();

  const findWord = async (tokens: Token[], i: number): Promise<SymbolRef | null> => {
    const t = tokens[i];
    if (prefs.has(t.key)) return prefs.get(t.key)!;
    if (t.concept) {
      if (prefs.has(t.concept)) return prefs.get(t.concept)!;
      const r = await resolveTarget(t.concept, order, t.cls);
      if (r) return r;
    }
    const sense = senseFor(tokens, i);
    if (sense?.ref) return sense.ref;
    const words = [...(sense?.words ?? []), t.key, ...t.alts];
    const cacheKey = `${t.cls}|${words.join('|')}|${sense?.skipCore ? 1 : 0}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    let found: SymbolRef | null = null;
    // Core pictures first: they are made for these exact little words.
    if (!sense?.skipCore) {
      for (const w of [t.key, ...t.alts]) {
        if (prefs.has(w)) return prefs.get(w)!;
        const core = lookupCore(w);
        if (core) {
          found = `c:${core}`;
          break;
        }
      }
    }
    if (!found) {
      outer: for (const w of words) {
        if (prefs.has(w)) {
          found = prefs.get(w)!;
          break;
        }
        for (const s of order) {
          const r = await lookupIn(s, w, t.cls, true);
          if (r && !sense?.avoid?.includes(r)) {
            found = r;
            break outer;
          }
        }
      }
    }
    cache.set(cacheKey, found);
    return found;
  };

  const findPhrase = async (phrase: string): Promise<SymbolRef | null> => {
    if (prefs.has(phrase)) return prefs.get(phrase)!;
    if (PHRASES[phrase]) return resolveTarget(PHRASES[phrase], order);
    const core = lookupCore(phrase);
    if (core) return `c:${core}`;
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
      // Phrases: the AI's grouping when it read the sentence, else the known phrase list.
      const phrases = t.aiGroup
        ? [{ phrase: tokens.slice(i, i + t.aiGroup + 1).map((g) => g.key).join(' '), n: t.aiGroup + 1 }]
        : phraseAt(tokens, i);
      for (const { phrase, n } of phrases) {
        const group = tokens.slice(i, i + n);
        if (group.length < n || group.some((g) => g.manual)) continue;
        const sym = (await findPhrase(phrase)) ?? (t.aiGroup && t.concept ? await resolveTarget(t.concept, order, t.cls) : null);
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
      if (!matched) t.sym = await findWord(tokens, i);
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
