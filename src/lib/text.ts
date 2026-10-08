import nlp from 'compromise';
import type { Token, WordClass } from './types';

/** Split pasted text into pages: a blank line starts a new page. */
export function splitPages(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Tidy text read from a photo: join wrapped lines, undo end-of-line hyphenation, drop stray symbols. */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[|\\_~^`]+/g, ' ')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter((para) => /[A-Za-z]/.test(para))
    .join('\n\n');
}

const NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');

/** Kid-book words that the symbol sets spell or name differently. Tried after the word itself. */
const SYNONYMS: Record<string, string[]> = {
  mom: ['mum', 'mother'],
  mommy: ['mum', 'mother'],
  momma: ['mum', 'mother'],
  mama: ['mum', 'mother'],
  mummy: ['mum', 'mother'],
  dad: ['father'],
  daddy: ['dad', 'father'],
  papa: ['dad', 'father'],
  grandma: ['grandmother'],
  granny: ['grandmother'],
  grandpa: ['grandfather'],
  airplane: ['aeroplane', 'plane'],
  color: ['colour'],
  colors: ['colour'],
  favorite: ['favourite'],
  gray: ['grey'],
  kitty: ['kitten', 'cat'],
  kitten: ['cat'],
  puppy: ['dog'],
  doggy: ['dog'],
  bunny: ['rabbit'],
  teddy: ['teddy bear'],
  tummy: ['stomach'],
  cookie: ['biscuit'],
  candy: ['sweets'],
  pants: ['trousers'],
  sweater: ['jumper'],
  diaper: ['nappy'],
  truck: ['lorry'],
  yell: ['shout'],
  shouted: ['shout'],
  hi: ['hello'],
  bye: ['goodbye'],
  okay: ['ok'],
  yeah: ['yes'],
  nope: ['no'],
};

type CTerm = { text: string; pre: string; post: string; normal: string; root?: string; implicit?: string; tags: string[] };

/** Break text into word tokens, with the forms to try when looking up pictures. */
export function tokenize(text: string): Token[] {
  const doc = nlp(text);
  doc.compute('root');
  const terms: CTerm[] = doc.json({ terms: { normal: true } }).flatMap((s: { terms: CTerm[] }) => s.terms);
  const tokens: Token[] = [];
  let lead = '';

  for (const t of terms) {
    if (!t.text) {
      // Second half of a contraction ("didn't" → did + not): fold into the visible word.
      const prev = tokens[tokens.length - 1];
      if (prev) {
        prev.post += t.post;
        if (t.tags.includes('Negative')) {
          prev.alts.splice(0, 0, 'not');
          prev.cls = 'negation';
        }
      } else lead += t.pre + t.post;
      continue;
    }
    const key = t.normal || t.text.toLowerCase();
    tokens.push({
      text: t.text,
      pre: lead + t.pre,
      post: t.post,
      key,
      alts: alternates(key, t),
      cls: classify(t.tags),
      sym: null,
    });
    lead = '';
  }
  // compromise drops leading/trailing whitespace; keep newlines inside the page.
  return tokens;
}

function alternates(key: string, t: CTerm): string[] {
  const out: string[] = [];
  const add = (w?: string) => {
    if (!w) return;
    w = w.toLowerCase().trim();
    if (w && w !== key && !out.includes(w)) out.push(w);
  };
  add(key.replace(/['’]s$/, '').replace(/s['’]$/, 's'));
  if (/^\d+$/.test(key) && Number(key) <= 20) add(NUMBERS[Number(key)]);
  add(t.root);
  if (t.implicit) add(t.implicit);
  for (const s of SYNONYMS[key] ?? []) add(s);
  if (t.root) for (const s of SYNONYMS[t.root] ?? []) add(s);
  for (const s of stems(key.replace(/['’]s$/, ''))) add(s);
  return out;
}

/** Simple fallbacks for word endings compromise did not resolve. */
export function stems(w: string): string[] {
  const out: string[] = [];
  const undouble = (s: string) => (/([bdgklmnprt])\1$/.test(s) ? s.slice(0, -1) : s);
  if (w.length > 4 && w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  if (w.length > 3 && /(ch|sh|x|ss|z)es$/.test(w)) out.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  for (const suf of ['ing', 'ed', 'est', 'er']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      const base = w.slice(0, -suf.length);
      out.push(undouble(base), base, base + 'e');
      if (base.endsWith('i')) out.push(base.slice(0, -1) + 'y');
    }
  }
  if (w.length > 4 && w.endsWith('ly')) out.push(w.slice(0, -2));
  return out;
}

function classify(tags: string[]): WordClass {
  const has = (t: string) => tags.includes(t);
  if (has('QuestionWord')) return 'question';
  if (has('Negative')) return 'negation';
  if (has('Pronoun')) return 'pronoun';
  if (has('Expression') || has('Interjection')) return 'social';
  if (has('Verb') || has('Auxiliary') || has('Copula')) return 'verb';
  if (has('Adjective') || has('Adverb') || has('Value')) return 'describe';
  if (has('Preposition')) return 'preposition';
  if (has('Noun')) return 'noun';
  if (has('Determiner') || has('Conjunction')) return 'little';
  return 'other';
}

/** Rebuild the text of a page from its tokens. */
export function tokensToText(tokens: Token[]): string {
  return tokens.map((t) => t.pre + t.text + t.post).join('').trim();
}
