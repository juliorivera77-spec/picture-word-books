// One-off: import The Tale of Peter Rabbit (Beatrix Potter, 1902; public domain) from Project Gutenberg #14838
// (https://github.com/GITenberg/The-Tale-of-Peter-Rabbit_14838), with its original illustrations.
//   NODE_PATH=<dir with sharp> node scripts/build-peter-rabbit.mjs /path/to/The-Tale-of-Peter-Rabbit_14838
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');
const src = process.argv[2];
const html = fs.readFileSync(path.join(src, '14838-h/14838-h.htm'), 'utf8');
const body = html.slice(html.indexOf('Once upon a time') - 200, html.indexOf('End of the Project Gutenberg'));
const unescape = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&mdash;/g, '—').replace(/&rsquo;|&lsquo;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
// In the Gutenberg edition each picture comes right after the text it illustrates.
const pages = [{ text: [], image: undefined }];
for (const m of body.matchAll(/<img[^>]*src="images\/([^"]+)"|<p[^>]*>([\s\S]*?)<\/p>/g)) {
  const cur = pages[pages.length - 1];
  if (m[1]) {
    if (cur.text.length && !cur.image) cur.image = m[1];
    pages.push({ text: [], image: undefined });
  } else {
    const t = unescape(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (t) cur.text.push(t);
  }
}
const dir = path.resolve('public/library/classic/peter-rabbit');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const out = [];
for (const [i, p] of pages.entries()) {
  if (!p.text.length) continue;
  let image;
  if (p.image) {
    const name = `${String(i).padStart(2, '0')}.jpg`;
    await sharp(path.join(src, '14838-h/images', p.image)).resize({ width: 600, withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(dir, name));
    image = `library/classic/peter-rabbit/${name}`;
  }
  out.push({ text: p.text.join('\n'), image });
}
await sharp(path.join(src, 'cover.png')).resize({ width: 360 }).flatten({ background: '#fff' }).jpeg({ quality: 72 }).toFile(path.join(dir, 'cover.jpg'));
const book = {
  id: 'classic-peter-rabbit',
  title: 'The Tale of Peter Rabbit',
  description: 'Peter does not listen to his mother and goes into Mr. McGregor’s garden. The original story and pictures.',
  credit: 'The Tale of Peter Rabbit by Beatrix Potter (1902). Public domain, from Project Gutenberg. Picture symbols added.',
  url: 'https://www.gutenberg.org/ebooks/14838',
  cover: 'library/classic/peter-rabbit/cover.jpg',
  pages: out,
};
fs.writeFileSync(path.resolve('src/lib/library/peter-rabbit.json'), JSON.stringify(book, null, 1));
console.log(out.length, 'pages', out.filter((p) => p.image).length, 'pictures');
