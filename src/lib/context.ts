// Offline context rules: pick the right meaning of a word from the words around it,
// so "on top of the table" does not get a picture of a clothing top.
// (When AI is turned on, a language model reads each whole sentence as well — see ai.ts.)
import type { SymbolRef, Token } from './types';

/** Multi-word phrases shown as one picture. Value: a picture ref or the word to look up instead. */
export const PHRASES: Record<string, string> = {
  'on top of': 'm:on',
  'on top': 'm:on',
  'at the top': 'm:top',
  'at the bottom': 'bottom',
  'in front of': 'm:in_front',
  'in front': 'm:in_front',
  'next to': 'c:by.svg',
  'thank you': 'c:thanks.png',
  'wake up': 'c:awake.png',
  'woke up': 'c:awake.png',
  'going to': 'c:will.svg',
  'a lot of': 'c:more.png',
  'lots of': 'c:more.png',
  'as well': 'c:also.svg',
  'the end': 'c:finish.png',
  'no one': 'c:nobody.png',
  'each other': 'c:people.png',
  'look at': 'look',
  'looked at': 'look',
  'looking at': 'look',
  'ice cream': 'ice cream',
  'teddy bear': 'teddy bear',
  'once upon a time': 'c:was.png',
  'good night': 'goodnight',
  'goodnight': 'goodnight',
};
const CLOTHING = /^(wear|wears|wore|worn|wearing|dress|dressed|shirt|t-shirt|blouse|put|new|pink|red|blue|green|striped|her|his|my|your)$/;

export interface Sense {
  /** A fixed picture to use. */
  ref?: SymbolRef;
  /** Words to look up instead of the word itself, best first. */
  words?: string[];
  /** Skip the built-in core picture (it shows a different meaning). */
  skipCore?: boolean;
  /** Pictures that show the wrong meaning here. */
  avoid?: SymbolRef[];
}

/** Words whose picture depends on the words around them. */
export function senseFor(tokens: Token[], i: number): Sense | null {
  const t = tokens[i];
  const prev = tokens[i - 1]?.key ?? '';
  const prev2 = tokens[i - 2]?.key ?? '';
  const next = tokens[i + 1]?.key ?? '';
  const nearby = tokens.slice(Math.max(0, i - 4), i + 4).map((x) => x.key);
  switch (t.key) {
    case 'top':
    case 'tops':
      // Clothing only when the sentence is about wearing it; otherwise the position.
      if (CLOTHING.test(prev) || nearby.some((w) => /^(wear|wore|wearing|dress|shirt|clothes)$/.test(w))) return { words: ['top', 't-shirt', 'shirt', 'blouse'], avoid: ['m:top', 'm:top_2'] };
      if (next === 'hat') return { words: ['top hat', 'hat'] };
      if (prev === 'spinning' || prev2 === 'spinning') return { words: ['spinning top', 'top'] };
      return { ref: 'm:top' };
    case 'bottom':
      return /^(the|at|to)$/.test(prev) ? { ref: 'm:under_1' } : null;
    case 'park':
    case 'parks':
      return t.cls === 'verb' ? { words: ['park'] } : { words: ['park', 'playground'], skipCore: true };
    case 'saw':
      return t.cls === 'verb' || /^(i|he|she|we|they|you|it)$/.test(prev) ? { ref: 'c:watch.png' } : { ref: 'm:saw' };
    case 'watch':
    case 'watches':
      return t.cls === 'noun' || /^(a|the|his|her|my|your|new)$/.test(prev) ? { ref: 'm:watch', skipCore: true } : null;
    case 'can':
    case 'cans':
      return t.cls === 'noun' || /^(a|the|tin|soda)$/.test(prev) ? { words: ['tin can', 'can', 'tin'], skipCore: true } : null;
    case 'like':
      // "like a bird" (similar to) vs "I like it"
      return t.cls === 'verb' ? null : { ref: 'c:same.svg' };
    case 'back':
      return t.cls === 'noun' && /^(my|his|her|your|its|their|our)$/.test(prev) ? { words: ['back'], skipCore: true } : null;
    case 'left':
      return t.cls === 'verb' ? { words: ['leave', 'go'] } : { words: ['left'] };
    case 'right':
      return /^(the|to|your|my|his|her|on)$/.test(prev) ? { words: ['right'] } : { words: ['correct', 'right'] };
    case 'well':
      return t.cls === 'noun' && /^(a|the)$/.test(prev) ? { words: ['well', 'water well'] } : { words: ['good', 'well'] };
    case 'fall':
      return t.cls === 'noun' ? { words: ['autumn', 'fall'] } : { words: ['fall'] };
    case 'bear':
      return t.cls === 'verb' ? { words: ['carry'] } : null;
    case 'bat':
      return t.cls === 'verb' ? { words: ['hit', 'bat'] } : null;
    case 'play':
    case 'plays':
      return t.cls === 'noun' ? { words: ['theatre', 'play'] } : null;
    default:
      return null;
  }
}

/** Find multi-word phrases starting at token i that are written next to each other with plain spaces. */
export function phraseAt(tokens: Token[], i: number, maxLen = 4): { phrase: string; n: number }[] {
  const out: { phrase: string; n: number }[] = [];
  for (let n = Math.min(maxLen, tokens.length - i); n >= 2; n--) {
    const group = tokens.slice(i, i + n);
    if (group.slice(0, -1).some((g, j) => !/^ +$/.test(g.post + group[j + 1].pre))) continue;
    out.push({ phrase: group.map((g) => g.key).join(' '), n });
  }
  return out;
}
