// ARASAAC pictograms (CC BY-NC-SA 4.0, Government of Aragón, author Sergio Palao).
// The word index and the pictures are downloaded once and kept on the device for offline use.
import { getImage, hasImage, kvGet, kvSet, putImage } from '../db';
import { shrinkImage } from '../images';

const API = 'https://api.arasaac.org/api/pictograms';
export const arasaacRemoteUrl = (id: number) => `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;

type Index = Record<string, number[]>;
/** Word class of each keyword, in the same order as the index: 1 name, 2 thing, 3 action, 4 describing, 5 social, 6 other. */
type Types = Record<string, number[]>;
export interface ArasaacMeta {
  date: number;
  pictograms: number;
  words: number;
  version?: number;
}
/** Bumped when the stored dictionary format changes, so the app can ask for an update. */
export const ARASAAC_INDEX_VERSION = 2;

let index: Index | null = null;
let types: Types | null = null;
let labels: Record<number, string> | null = null;
let loaded: Promise<void> | null = null;

function loadIndex() {
  loaded ??= (async () => {
    index = (await kvGet<Index>('arasaac:index')) ?? null;
    types = (await kvGet<Types>('arasaac:types')) ?? null;
    labels = (await kvGet<Record<number, string>>('arasaac:labels')) ?? null;
  })();
  return loaded;
}

export async function arasaacMeta() {
  return kvGet<ArasaacMeta>('arasaac:meta');
}

export async function hasArasaacIndex() {
  await loadIndex();
  return !!index;
}

interface ApiPictogram {
  _id: number;
  keywords?: { keyword?: string; plural?: string; type?: number }[];
  sex?: boolean;
  violence?: boolean;
}

/** Download the full English word list (about 13,000 pictograms) so lookups work offline. */
export async function downloadArasaacIndex(onStatus?: (s: string) => void): Promise<ArasaacMeta> {
  onStatus?.('Downloading the ARASAAC word list…');
  const res = await fetch(`${API}/all/en`);
  if (!res.ok) throw new Error(`ARASAAC returned HTTP ${res.status}`);
  const all: ApiPictogram[] = await res.json();
  onStatus?.('Building the offline dictionary…');
  const scored: Record<string, [number, number, number][]> = {};
  const lab: Record<number, string> = {};
  for (const p of all) {
    if (p.sex || p.violence) continue;
    (p.keywords ?? []).forEach((k, i) => {
      for (const w of [k.keyword, k.plural]) {
        const key = w?.toLowerCase().trim();
        if (!key) continue;
        (scored[key] ||= []).push([p._id, i, k.type ?? 0]);
      }
      if (i === 0 && k.keyword) lab[p._id] = k.keyword;
    });
  }
  const idx: Index = {};
  const typ: Types = {};
  for (const [k, list] of Object.entries(scored)) {
    const seen = new Set<number>();
    const sorted = list.sort((a, b) => a[1] - b[1] || a[0] - b[0]).filter((x) => !seen.has(x[0]) && seen.add(x[0]));
    idx[k] = sorted.map((x) => x[0]);
    typ[k] = sorted.map((x) => x[2]);
  }
  const meta: ArasaacMeta = {
    date: Date.now(),
    pictograms: Object.keys(lab).length,
    words: Object.keys(idx).length,
    version: ARASAAC_INDEX_VERSION,
  };
  await kvSet('arasaac:index', idx);
  await kvSet('arasaac:types', typ);
  await kvSet('arasaac:labels', lab);
  await kvSet('arasaac:meta', meta);
  index = idx;
  types = typ;
  labels = lab;
  return meta;
}

/** ARASAAC keyword type for one of our word classes. */
const TYPE_FOR: Record<string, number> = { noun: 2, verb: 3, describe: 4, social: 5 };

/** Put pictograms whose keyword has the wanted word class first ("park" the place vs "park" the car). */
function byClass(ids: number[], kinds: number[] | undefined, cls?: string): number[] {
  const want = cls ? TYPE_FOR[cls] : undefined;
  if (!want || !kinds) return ids;
  const good = ids.filter((_, i) => kinds[i] === want);
  return good.length ? [...good, ...ids.filter((_, i) => kinds[i] !== want)] : ids;
}

/** Pictogram ids for an exact word, best first. Uses the offline index, else the online API (results are remembered). */
export async function lookupArasaac(word: string, cls?: string): Promise<number[]> {
  await loadIndex();
  const w = word.toLowerCase();
  if (index) return byClass(index[w] ?? [], types?.[w], cls);
  const cacheKey = `arasaac:q2:${w}`;
  const cached = await kvGet<{ ids: number[]; kinds: number[] }>(cacheKey);
  if (cached) return byClass(cached.ids, cached.kinds, cls);
  if (!navigator.onLine) return [];
  try {
    const res = await fetch(`${API}/en/bestsearch/${encodeURIComponent(w)}`);
    if (res.status === 404) {
      await kvSet(cacheKey, { ids: [], kinds: [] });
      return [];
    }
    if (!res.ok) return [];
    const data: ApiPictogram[] = (await res.json()).filter((p: ApiPictogram) => !p.sex && !p.violence);
    const ids = data.map((p) => p._id);
    const kinds = data.map((p) => p.keywords?.find((k) => k.keyword?.toLowerCase() === w || k.plural?.toLowerCase() === w)?.type ?? 0);
    await kvSet(cacheKey, { ids, kinds });
    for (const p of data) if (p.keywords?.[0]?.keyword) await rememberLabel(p._id, p.keywords[0].keyword);
    return byClass(ids, kinds, cls);
  } catch {
    return [];
  }
}

/** Broader search for the picture picker. */
export async function searchArasaac(query: string, limit = 40): Promise<number[]> {
  await loadIndex();
  const q = query.toLowerCase().trim();
  if (!q) return [];
  if (navigator.onLine) {
    try {
      const res = await fetch(`${API}/en/search/${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: ApiPictogram[] = await res.json();
        for (const p of data) if (p.keywords?.[0]?.keyword) await rememberLabel(p._id, p.keywords[0].keyword);
        return data.filter((p) => !p.sex && !p.violence).map((p) => p._id).slice(0, limit);
      }
    } catch {
      /* fall back to the offline index */
    }
  }
  if (!index) return lookupArasaac(q);
  const out = [...(index[q] ?? [])];
  for (const [k, ids] of Object.entries(index)) {
    if (out.length >= limit) break;
    if (k !== q && (k.startsWith(q + ' ') || k.endsWith(' ' + q) || k.includes(' ' + q + ' '))) out.push(...ids);
  }
  return [...new Set(out)].slice(0, limit);
}

async function rememberLabel(id: number, label: string) {
  if (labels?.[id]) return;
  const key = `arasaac:label:${id}`;
  if (!(await kvGet(key))) await kvSet(key, label);
}

export async function arasaacLabel(id: number): Promise<string> {
  await loadIndex();
  return labels?.[id] ?? (await kvGet<string>(`arasaac:label:${id}`)) ?? '';
}

/** Store a pictogram on the device. Returns false if it could not be fetched (e.g. offline). */
export async function cacheArasaac(id: number): Promise<boolean> {
  const key = `a:${id}`;
  if (await hasImage(key)) return true;
  for (const url of [arasaacRemoteUrl(id), `${API}/${id}?download=false`]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) continue;
      await putImage(key, await shrinkImage(blob, 300, 'image/png'), 'arasaac');
      return true;
    } catch {
      /* try the next URL */
    }
  }
  return false;
}

/** URL to display a pictogram: the stored copy if we have it, otherwise the web (the service worker caches it). */
export async function arasaacUrl(id: number): Promise<string> {
  const img = await getImage(`a:${id}`);
  if (img) return URL.createObjectURL(img.blob);
  return arasaacRemoteUrl(id);
}

/** Download every pictogram in the index, for families who want the whole library offline. */
export async function downloadAllArasaac(onProgress: (done: number, total: number) => void, signal: AbortSignal) {
  await loadIndex();
  if (!index) throw new Error('Download the word list first.');
  const ids = [...new Set(Object.values(index).flat())];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < ids.length && !signal.aborted) {
      const id = ids[next++];
      await cacheArasaac(id);
      onProgress(++done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
