import JSZip from 'jszip';
import type { ImportedPage } from './pdf';

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,figcaption,td';
const WORDS_PER_PAGE = 60;

/** Split an EPUB into pages: each chapter/section, broken into ~60-word pages at paragraph breaks. */
export async function importEpub(file: File, onStatus: (s: string) => void): Promise<{ title?: string; pages: ImportedPage[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (p: string) => {
    const f = zip.file(p) ?? zip.file(decodeURIComponent(p));
    if (!f) throw new Error(`Missing file in EPUB: ${p}`);
    return f.async('string');
  };
  const parse = (xml: string, type: DOMParserSupportedType = 'application/xml') => new DOMParser().parseFromString(xml, type);

  const container = parse(await read('META-INF/container.xml'));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no table of contents (container.xml).');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = parse(await read(opfPath));
  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || undefined;

  const manifest = new Map<string, string>();
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    manifest.set(item.getAttribute('id') ?? '', item.getAttribute('href') ?? '');
  }
  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref')).map((r) => manifest.get(r.getAttribute('idref') ?? ''));

  const pages: ImportedPage[] = [];
  let i = 0;
  for (const href of spine) {
    i++;
    if (!href) continue;
    onStatus(`Reading section ${i} of ${spine.length}…`);
    const html = await read(opfDir + href.split('#')[0]);
    let doc = parse(html, 'application/xhtml+xml');
    if (doc.querySelector('parsererror')) doc = parse(html, 'text/html');
    const body = doc.querySelector('body');
    if (!body) continue;
    // Leaf text blocks only, so nested elements are not counted twice.
    let paras = Array.from(body.querySelectorAll(BLOCKS))
      .filter((el) => !el.querySelector(BLOCKS))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!paras.length) {
      const t = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
      paras = t ? [t] : [];
    }
    let cur: string[] = [];
    let words = 0;
    for (const p of paras) {
      const n = p.split(' ').length;
      if (cur.length && words + n > WORDS_PER_PAGE) {
        pages.push({ text: cur.join('\n') });
        cur = [];
        words = 0;
      }
      cur.push(p);
      words += n;
    }
    if (cur.length) pages.push({ text: cur.join('\n') });
  }
  return { title, pages };
}
