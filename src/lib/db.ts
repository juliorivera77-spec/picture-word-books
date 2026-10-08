import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, Settings, SymbolRef } from './types';
import { DEFAULT_SETTINGS } from './types';

export type ImageKind = 'arasaac' | 'photo' | 'drawing' | 'ai' | 'scan';

interface StoredImage {
  blob: Blob;
  kind: ImageKind;
  created: number;
  /** For user pictures: the word it was made for (helps searching later). */
  label?: string;
}

interface Schema extends DBSchema {
  books: { key: string; value: Book };
  images: { key: string; value: StoredImage };
  /** The user's chosen picture for a word, used in every book. */
  wordPrefs: { key: string; value: SymbolRef };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  dbPromise ??= openDB<Schema>('picture-word-books', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('images');
      d.createObjectStore('wordPrefs');
      d.createObjectStore('kv');
    },
  });
  return dbPromise;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');

// ---------- books ----------
export async function listBooks(): Promise<Book[]> {
  const all = await (await db()).getAll('books');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getBook(id: string) {
  return (await db()).get('books', id);
}
export async function saveBook(book: Book) {
  book.updatedAt = Date.now();
  await (await db()).put('books', book);
}
export async function deleteBook(id: string) {
  const d = await db();
  const book = await d.get('books', id);
  await d.delete('books', id);
  // Page scans belong to the book alone; symbols and user pictures may be shared.
  for (const p of book?.pages ?? []) if (p.imageId) await d.delete('images', p.imageId);
}

// ---------- images ----------
export async function putImage(id: string, blob: Blob, kind: ImageKind, label?: string) {
  await (await db()).put('images', { blob, kind, created: Date.now(), label }, id);
}
export async function getImage(id: string) {
  return (await db()).get('images', id);
}
export async function hasImage(id: string) {
  return (await (await db()).getKey('images', id)) !== undefined;
}
export async function listUserImages() {
  const d = await db();
  const tx = d.transaction('images');
  const out: { id: string; label?: string; kind: ImageKind }[] = [];
  for await (const cur of tx.store.iterate()) {
    const v = cur.value;
    if (v.kind === 'photo' || v.kind === 'drawing' || v.kind === 'ai') out.push({ id: String(cur.key), label: v.label, kind: v.kind });
  }
  return out;
}
export async function countImages(kind: ImageKind) {
  const d = await db();
  let n = 0;
  for await (const cur of d.transaction('images').store.iterate()) if (cur.value.kind === kind) n++;
  return n;
}

// ---------- word preferences ----------
export async function getAllWordPrefs(): Promise<Map<string, SymbolRef>> {
  const d = await db();
  const keys = await d.getAllKeys('wordPrefs');
  const vals = await d.getAll('wordPrefs');
  return new Map(keys.map((k, i) => [String(k), vals[i]]));
}
export async function setWordPref(word: string, sym: SymbolRef) {
  await (await db()).put('wordPrefs', sym, word.toLowerCase());
}

// ---------- key/value ----------
export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

// ---------- settings (small, kept in localStorage for synchronous access) ----------
const SETTINGS_KEY = 'pwb-settings';
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const s: Settings = { ...DEFAULT_SETTINGS, ...saved };
      // Version 1 had AI drawing off by default; turn the new AI helpers on for people who enabled AI.
      if (!saved.version || saved.version < 2) {
        s.aiAuto = true;
        s.aiContext = true;
        s.aiOcr = true;
        s.version = 2;
      }
      return s;
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}
export function storeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
