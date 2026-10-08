import type { Settings, Token } from '../lib/types';
import { SymbolImage } from './SymbolImage';

export function displayCase(text: string, s: Settings) {
  if (s.textCase === 'lower') return text.toLowerCase();
  if (s.textCase === 'upper') return text.toUpperCase();
  return text;
}

/** One picture + its word(s). `group` is a single word, or a phrase like "ice cream". */
export function WordCard({
  group,
  settings,
  active,
  editing,
  onTap,
}: {
  group: Token[];
  settings: Settings;
  active?: boolean;
  editing?: boolean;
  onTap: () => void;
}) {
  const head = group[0];
  const last = group[group.length - 1];
  const words = group.map((t, i) => (i ? t.pre : '') + t.text + (i < group.length - 1 ? t.post : '')).join('');
  const label = (
    <span className="word">
      {head.pre.replace(/\s+/g, '')}
      {displayCase(words, settings)}
      {last.post.replace(/\s+/g, '')}
    </span>
  );
  const cls = [
    'card',
    settings.wordPosition === 'above' ? 'card-above' : '',
    settings.colorCode ? `fk fk-${head.cls}` : '',
    active ? 'card-active' : '',
    editing ? 'card-editing' : '',
    !head.sym ? 'card-missing' : '',
  ].join(' ');
  return (
    <button type="button" className={cls} onClick={onTap} aria-label={words}>
      {settings.wordPosition === 'above' && label}
      <SymbolImage symbol={head.sym} alt="" />
      {settings.wordPosition !== 'above' && label}
    </button>
  );
}
