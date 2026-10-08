// Mulberry Symbols (CC BY-SA 4.0, Steve Lee) are bundled with the app,
// so they work offline from the moment it is installed.
const BASE = `${import.meta.env.BASE_URL}symbols/mulberry/`;

let indexPromise: Promise<Record<string, string[]>> | null = null;
const shardPromises = new Map<string, Promise<Record<string, string>>>();
const urlCache = new Map<string, string>();

export function mulberryIndex() {
  indexPromise ??= fetch(BASE + 'index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Mulberry index: HTTP ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

export async function lookupMulberry(word: string): Promise<string[]> {
  const idx = await mulberryIndex();
  return idx[word.toLowerCase()] ?? [];
}

/** Keywords that contain the search text, for the picture picker. */
export async function searchMulberry(query: string, limit = 40): Promise<string[]> {
  const idx = await mulberryIndex();
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const exact = idx[q] ?? [];
  const rest: string[] = [];
  for (const [k, names] of Object.entries(idx)) {
    if (k !== q && (k.startsWith(q + ' ') || k.endsWith(' ' + q) || k.includes(' ' + q + ' '))) rest.push(...names);
    if (rest.length > limit) break;
  }
  return [...new Set([...exact, ...rest])].slice(0, limit);
}

export function shardOf(name: string) {
  const m = /^(flag|country)_(.)/.exec(name);
  if (m) return `${m[1]}_${m[2].toLowerCase()}`;
  const c = name[0].toLowerCase();
  return /[a-z]/.test(c) ? c : '0';
}

function loadShard(shard: string) {
  let p = shardPromises.get(shard);
  if (!p) {
    p = fetch(`${BASE}${shard}.json`).then((r) => {
      if (!r.ok) throw new Error(`Mulberry shard ${shard}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => shardPromises.delete(shard));
    shardPromises.set(shard, p);
  }
  return p;
}

export async function mulberrySvg(name: string): Promise<string | undefined> {
  return (await loadShard(shardOf(name)))[name];
}

export async function mulberryUrl(name: string): Promise<string | undefined> {
  const cached = urlCache.get(name);
  if (cached) return cached;
  const svg = await mulberrySvg(name);
  if (!svg) return undefined;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  urlCache.set(name, url);
  return url;
}

/** "eat_2_,_to" → "eat" — a readable label for a symbol name. */
export function mulberryLabel(name: string) {
  return name.replace(/_,_to(_\d+)?$/, '').replace(/_\d+$/, '').replace(/_/g, ' ');
}
