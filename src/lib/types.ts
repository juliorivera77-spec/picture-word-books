/**
 * A reference to a picture:
 *   "m:<name>"  Mulberry symbol (bundled with the app)
 *   "a:<id>"    ARASAAC pictogram (cached on the device)
 *   "u:<id>"    the user's own picture: photo, drawing or AI image (stored on the device)
 *   "none"      deliberately no picture
 */
export type SymbolRef = string;

/** Part-of-speech group, used for the optional Fitzgerald-key colour coding. */
export type WordClass =
  | 'pronoun'
  | 'noun'
  | 'verb'
  | 'describe'
  | 'preposition'
  | 'question'
  | 'negation'
  | 'social'
  | 'little'
  | 'other';

export interface Token {
  /** The word exactly as written, e.g. "Bear's" or "didn't". */
  text: string;
  /** Punctuation/whitespace before and after the word, as written. */
  pre: string;
  post: string;
  /** Lower-case lookup key ("bear's"). */
  key: string;
  /** Other forms to try when looking up a picture, best first ("bear"). */
  alts: string[];
  cls: WordClass;
  /** Picture shown above the word; null = none found yet. */
  sym: SymbolRef | null;
  /** How many following tokens this picture also covers (e.g. "ice cream" → 1). */
  span?: number;
  /** True when this token is covered by the previous token's multi-word picture. */
  joined?: boolean;
  /** Set when the user picked the picture by hand. */
  manual?: boolean;
}

export interface Page {
  id: string;
  text: string;
  tokens: Token[];
  /** Original page photo/scan, stored as an image id. */
  imageId?: string;
}

export interface Book {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: Page[];
}

export type WordPosition = 'below' | 'above';
export type TextCase = 'asis' | 'lower' | 'upper';

export interface Settings {
  pictureSize: number;
  fontSize: number;
  wordPosition: WordPosition;
  textCase: TextCase;
  colorCode: boolean;
  sourceOrder: ('arasaac' | 'mulberry')[];
  voiceURI: string;
  speechRate: number;
  aiEnabled: boolean;
  aiKey: string;
  aiModel: string;
  aiAuto: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  pictureSize: 96,
  fontSize: 22,
  wordPosition: 'below',
  textCase: 'asis',
  colorCode: false,
  sourceOrder: ['arasaac', 'mulberry'],
  voiceURI: '',
  speechRate: 0.85,
  aiEnabled: false,
  aiKey: '',
  aiModel: 'gpt-image-1',
  aiAuto: false,
};

/** A page while a book is being created, before pictures are matched. */
export interface DraftPage {
  id: string;
  text: string;
  image?: Blob;
  status?: string;
}
