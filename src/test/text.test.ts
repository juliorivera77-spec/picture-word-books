import { describe, expect, it } from 'vitest';
import { cleanOcrText, splitPages, stems, tokenize, tokensToText } from '../lib/text';

describe('tokenize', () => {
  it('keeps the original text and punctuation', () => {
    const text = "\"Hello!\" said Mom. The bear's mice ran.\nThey didn't stop.";
    expect(tokensToText(tokenize(text))).toBe(text);
  });

  it('offers base forms to look up', () => {
    const t = tokenize('The mice ran to the bigger dogs');
    const by = Object.fromEntries(t.map((x) => [x.key, x.alts]));
    expect(by.mice).toContain('mouse');
    expect(by.ran).toContain('run');
    expect(by.bigger).toContain('big');
    expect(by.dogs).toContain('dog');
  });

  it('handles possessives, contractions and numbers', () => {
    const t = tokenize("Bear's cup. I don't see 3 cats.");
    expect(t.find((x) => x.text === "Bear's")!.alts).toContain('bear');
    const dont = t.find((x) => x.text === "don't")!;
    expect(dont.alts[0]).toBe('not');
    expect(dont.cls).toBe('negation');
    expect(t.find((x) => x.text === '3')!.alts).toContain('three');
  });

  it('maps US kid words to symbol-set names', () => {
    expect(tokenize('Mommy').find((x) => x.key === 'mommy')!.alts).toContain('mum');
  });

  it('colour-codes word classes', () => {
    const cls = Object.fromEntries(tokenize('She runs to the big house').map((x) => [x.key, x.cls]));
    expect(cls).toMatchObject({ she: 'pronoun', runs: 'verb', to: 'preposition', the: 'little', big: 'describe', house: 'noun' });
  });
});

describe('page helpers', () => {
  it('splits pages on blank lines', () => {
    expect(splitPages('One.\nStill one.\n\n\nTwo.')).toEqual(['One.\nStill one.', 'Two.']);
  });
  it('cleans OCR line wraps and hyphenation', () => {
    expect(cleanOcrText('The little ele-\nphant | walked\nhome.\n\n~~\n\nThe end.')).toBe('The little elephant walked home.\n\nThe end.');
  });
  it('generates stems', () => {
    expect(stems('jumping')).toContain('jump');
    expect(stems('hopped')).toContain('hop');
    expect(stems('puppies')).toContain('puppy');
  });
});
