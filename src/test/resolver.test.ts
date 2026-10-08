import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../lib/text';
import { DEFAULT_SETTINGS } from '../lib/types';

// Serve the bundled Mulberry files from disk; pretend to be offline so ARASAAC is skipped.
beforeAll(() => {
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('fetch', async (url: string) => {
    const file = path.resolve('public', String(url).replace(/^\.?\//, '').replace(/^.*?symbols\//, 'symbols/'));
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200 });
  });
});

describe('matchTokens (offline, Mulberry only)', () => {
  it('finds pictures, joins phrases and reports missing words', async () => {
    const { matchTokens } = await import('../lib/symbols/resolver');
    const tokens = tokenize('The dog ate an ice cream and ran home.');
    const res = await matchTokens([tokens], DEFAULT_SETTINGS);
    const sym = (w: string) => tokens.find((t) => t.key === w)?.sym;
    expect(sym('dog')).toBe('m:dog');
    expect(sym('ate')).toMatch(/^m:eat/);
    expect(sym('ran')).toMatch(/^m:run/);
    const ice = tokens.find((t) => t.key === 'ice')!;
    expect(ice.sym).toMatch(/^m:ice_cream/);
    expect(ice.span).toBe(1);
    expect(tokens.find((t) => t.key === 'cream')!.joined).toBe(true);
    expect(res.missing).toContain('the'); // little words come from ARASAAC once its dictionary is downloaded
  });

  it('prefers the picture the user chose before', async () => {
    const { setWordPref } = await import('../lib/db');
    const { matchTokens } = await import('../lib/symbols/resolver');
    await setWordPref('dog', 'u:mydog');
    const tokens = tokenize('My dogs');
    await matchTokens([tokens], DEFAULT_SETTINGS);
    expect(tokens[1].sym).toBe('u:mydog');
  });
});
