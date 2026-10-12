import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { COLLECTION, applyHints } from '../lib/library';
import { tokenize } from '../lib/text';
import { DEFAULT_SETTINGS } from '../lib/types';

beforeAll(() => {
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('fetch', async (url: string) => {
    const file = path.resolve('public', String(url).replace(/^.*?symbols\//, 'symbols/'));
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200 });
  });
});

describe('book collection', () => {
  it('has unique ids and real pages', () => {
    expect(new Set(COLLECTION.map((b) => b.id)).size).toBe(COLLECTION.length);
    for (const b of COLLECTION) expect(b.pages.some((p) => p.text.trim())).toBe(true);
  });

  // Offline with only the built-in pictures (no ARASAAC download). On a phone that is online when
  // the book is added, ARASAAC fills most of the rest.
  it('most words have a picture even fully offline, and hints cover names and sounds', async () => {
    const { matchTokens } = await import('../lib/symbols/resolver');
    let words = 0;
    let blank = 0;
    const report: string[] = [];
    for (const b of COLLECTION) {
      const pages = b.pages.map((p) => tokenize(p.text));
      for (const t of pages) applyHints(t, b.hints);
      const res = await matchTokens(pages, DEFAULT_SETTINGS);
      const all = pages.flat().filter((t) => !t.joined);
      const missing = all.filter((t) => !t.sym).length;
      // Old classics (Beatrix Potter, Mother Goose) use old-fashioned words; they are reported but not counted.
      if (!b.id.startsWith('classic-')) {
        words += all.length;
        blank += missing;
      }
      report.push(`${Math.round((100 * (all.length - missing)) / all.length)}% ${b.id}: ${res.missing.join(', ')}`);
      if (b.hints) for (const k of Object.keys(b.hints)) expect(res.missing).not.toContain(k.split(/[\s,]+/)[0]);
    }
    console.log(report.join('\n') + `\nOVERALL ${Math.round((100 * (words - blank)) / words)}% of ${words} words`);
    expect((words - blank) / words).toBeGreaterThan(0.8);
  });
});
