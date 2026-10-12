import bookdash from './bookdash.json';
import peter from './peter-rabbit.json';
import { WRITTEN } from './written';

export type Category = 'first' | 'story' | 'social' | 'rhyme';

export interface CollectionPage {
  text: string;
  /** Illustration published with the app (path under the app's base URL). */
  image?: string;
}

export interface CollectionBook {
  id: string;
  title: string;
  description: string;
  category: Category;
  /** 1 = first words, 2 = short sentences, 3 = longer stories */
  level: 1 | 2 | 3;
  credit: string;
  url?: string;
  cover?: string;
  pages: CollectionPage[];
  /** Pictures for names and sounds: word or phrase → word to look up ("-" = no picture). */
  hints?: Record<string, string>;
}

export const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'first', label: 'First words' },
  { id: 'story', label: 'Stories' },
  { id: 'social', label: 'Social stories' },
  { id: 'rhyme', label: 'Rhymes & songs' },
];

export const LEVELS = { 1: 'Easy', 2: 'Short sentences', 3: 'Longer story' } as const;

const words = (b: { pages: CollectionPage[] }) => b.pages.map((p) => p.text).join(' ').split(/\s+/).filter(Boolean).length;

export const COLLECTION: CollectionBook[] = [
  ...WRITTEN.map((w) => ({
    id: w.id,
    title: w.title,
    description: w.description,
    category: w.kind,
    level: w.level,
    credit: w.credit,
    hints: w.hints,
    pages: w.text.split(/\n\s*\n/).map((t) => ({ text: t.trim() })),
  })),
  ...(bookdash as Omit<CollectionBook, 'category' | 'level'>[]).map((b) => ({
    ...b,
    category: 'story' as const,
    level: (words(b) <= 130 ? 2 : 3) as 2 | 3,
  })),
  { ...(peter as Omit<CollectionBook, 'category' | 'level'>), category: 'story' as const, level: 3 as const },
];

export const collectionBook = (id: string) => COLLECTION.find((b) => b.id === id);

/** Apply a book's hints to its tokens before pictures are matched. */
export function applyHints(tokens: import('../types').Token[], hints?: Record<string, string>) {
  if (!hints) return;
  for (const [phrase, target] of Object.entries(hints)) {
    const words = phrase.toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (!words.every((w, j) => tokens[i + j].key === w)) continue;
      const t = tokens[i];
      if (target === '-') {
        t.sym = 'none';
        t.manual = true;
      } else {
        t.concept = target;
        if (words.length > 1) t.aiGroup = words.length - 1;
      }
    }
  }
}
