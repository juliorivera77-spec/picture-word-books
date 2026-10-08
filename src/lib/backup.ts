import { db, getImage, putImage, type ImageKind } from './db';
import { blobToDataUrl, dataUrlToBlob } from './images';
import type { Book, SymbolRef } from './types';

interface BackupFile {
  app: 'picture-word-books';
  version: 1;
  books: Book[];
  wordPrefs: [string, SymbolRef][];
  images: { id: string; kind: ImageKind; label?: string; data: string }[];
}

/** Everything needed to move books to another device: books, chosen pictures, photos and scans. */
export async function exportBackup(): Promise<Blob> {
  const d = await db();
  const books = await d.getAll('books');
  const prefKeys = await d.getAllKeys('wordPrefs');
  const prefVals = await d.getAll('wordPrefs');
  const wordPrefs = prefKeys.map((k, i) => [String(k), prefVals[i]] as [string, SymbolRef]);
  const needed = new Set<string>();
  for (const b of books)
    for (const p of b.pages) {
      if (p.imageId) needed.add(p.imageId);
      for (const t of p.tokens) if (t.sym && /^[au]:/.test(t.sym)) needed.add(t.sym);
    }
  for (const [, s] of wordPrefs) if (/^[au]:/.test(s)) needed.add(s);
  const images: BackupFile['images'] = [];
  for (const id of needed) {
    const img = await getImage(id);
    if (img) images.push({ id, kind: img.kind, label: img.label, data: await blobToDataUrl(img.blob) });
  }
  const file: BackupFile = { app: 'picture-word-books', version: 1, books, wordPrefs, images };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as BackupFile;
  if (data.app !== 'picture-word-books') throw new Error('This is not a Picture Word Books backup file.');
  const d = await db();
  for (const img of data.images) await putImage(img.id, await dataUrlToBlob(img.data), img.kind, img.label);
  for (const [k, v] of data.wordPrefs) await d.put('wordPrefs', v, k);
  for (const b of data.books) await d.put('books', b);
  return data.books.length;
}
