// One-off: packs the Mulberry symbol set (https://github.com/mulberrysymbols/mulberry-symbols)
// into sharded JSON files the app can precache for offline use.
//   node scripts/build-mulberry.mjs /path/to/mulberry-symbols
import fs from 'node:fs';
import path from 'node:path';
import { optimize } from 'svgo';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/build-mulberry.mjs /path/to/mulberry-symbols');
const out = path.resolve('public/symbols/mulberry');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const row = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else cur += c;
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

const [header, ...rows] = parseCsv(fs.readFileSync(path.join(src, 'scripts/data/symbol-info-en.csv'), 'utf8'));
const col = (n) => header.indexOf(n);
const VARIANT = new Set(['man', 'lady', 'boy', 'girl', 'woman', 'male', 'female', 'person', 'parent']);

const index = {}; // keyword -> [{n: name, s: score}]
const add = (key, name, score) => {
  key = key.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return;
  (index[key] ||= []).push({ n: name, s: score });
};

const shards = {};
let count = 0;
for (const r of rows) {
  const name = r[col('symbol')];
  const category = r[col('category')];
  const file = path.join(src, 'EN', name + '.svg');
  if (!fs.existsSync(file)) continue;
  if (category === 'Alphabet') continue; // "I" here is the letter, not the pronoun
  const svg = optimize(fs.readFileSync(file, 'utf8'), {
    multipass: true,
    plugins: ['preset-default', 'removeDimensions'],
  }).data;
  const shard = shardOf(name);
  (shards[shard] ||= {})[name] = svg;
  count++;

  // Derive keywords from the symbol name: "eat_2_,_to" -> "eat", "ice_cream" -> "ice cream"
  let base = name.replace(/_,_to(_\d+)?$/, '').replace(/_\d+$/, '').replace(/_[a-z]$/, '');
  const isNumbered = base !== name.replace(/_,_to(_\d+)?$/, '');
  const words = base.split('_').filter(Boolean);
  add(words.join(' '), name, isNumbered ? 1 : 0);
  // "afraid_man" / "afraid_lady" are both just "afraid"
  if (words.length === 2 && VARIANT.has(words[1])) add(words[0], name, 2);
}

for (const [k, v] of Object.entries(shards)) fs.writeFileSync(path.join(out, `${k}.json`), JSON.stringify(v));
const compact = {};
for (const [k, list] of Object.entries(index)) compact[k] = list.sort((a, b) => a.s - b.s).map((x) => x.n);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(compact));
console.log(`packed ${count} symbols into ${Object.keys(shards).length} shards; ${Object.keys(compact).length} keywords`);

function shardOf(name) {
  if (/^(flag|country)_/.test(name)) return name.slice(0, name.indexOf('_')) + '_' + name[name.indexOf('_') + 1].toLowerCase();
  const c = name[0].toLowerCase();
  return /[a-z]/.test(c) ? c : '0';
}
