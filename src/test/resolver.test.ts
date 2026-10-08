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
    expect(sym('ate')).toBe('c:eat.png');
    expect(sym('ran')).toMatch(/^m:run/);
    const ice = tokens.find((t) => t.key === 'ice')!;
    expect(ice.sym).toMatch(/^m:ice_cream/);
    expect(ice.span).toBe(1);
    expect(tokens.find((t) => t.key === 'cream')!.joined).toBe(true);
    expect(res.missing).toEqual([]);
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

describe('context and little words', () => {
  const run = async (text: string) => {
    const { matchTokens } = await import('../lib/symbols/resolver');
    const tokens = tokenize(text);
    const res = await matchTokens([tokens], DEFAULT_SETTINGS);
    const sym = (w: string) => tokens.find((t) => t.key === w && !t.joined)?.sym;
    return { tokens, res, sym };
  };

  it('gives little words a picture', async () => {
    const { sym, res } = await run('He is not happy, but she can see the big dog.');
    expect(sym('he')).toBe('c:he.png');
    expect(sym('is')).toBe('c:is.png');
    expect(sym('not')).toBe('c:no.png');
    expect(sym('but')).toBe('c:but.svg');
    expect(sym('can')).toBe('c:can.svg');
    expect(sym('the')).toBe('c:the.svg');
    expect(res.missing).toEqual([]);
  });

  it('handles contractions', async () => {
    const { sym } = await run("I don't like it.");
    expect(sym("don't")).toBe('c:no.png');
    expect(sym('like')).toBe('c:like.svg');
  });

  it('reads "on top of" as a position, not clothing', async () => {
    const { tokens } = await run('The cat sat on top of the box.');
    const on = tokens.find((t) => t.key === 'on')!;
    expect(on.sym).toBe('m:on');
    expect(on.span).toBe(2);
  });

  it('uses the position picture for "top" unless it is about clothes', async () => {
    expect((await run('Climb to the top.')).sym('top')).toBe('m:top');
    expect((await run('She wore her new top.')).sym('top')).not.toBe('m:top');
  });

  it('uses word class for words with two meanings', async () => {
    expect((await run('We went to the park.')).sym('park')).not.toBe('m:park_,_to');
    expect((await run('I saw a bird.')).sym('saw')).toBe('c:watch.png');
    expect((await run('He cut it with a saw.')).sym('saw')).toBe('m:saw');
    expect((await run('It flew like a bird.')).sym('like')).toBe('c:same.svg');
  });

  it('follows the meaning chosen by the AI sentence reader', async () => {
    const { matchTokens } = await import('../lib/symbols/resolver');
    const tokens = tokenize('The bat flew away.');
    tokens.find((t) => t.key === 'bat')!.concept = 'bat';
    await matchTokens([tokens], DEFAULT_SETTINGS);
    expect(tokens.find((t) => t.key === 'bat')!.sym).toBe('m:bat');
  });
});
