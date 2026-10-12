// One-off: import selected Book Dash books (CC BY 4.0, https://bookdash.org) into the app's collection.
//   NODE_PATH=<dir with sharp> node scripts/build-bookdash.mjs /path/to/bookdash-books
// Writes src/lib/library/bookdash.json (text, credits) and public/library/bookdash/<book>/NN.jpg (illustrations).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/build-bookdash.mjs /path/to/bookdash-books');

// Chosen for short, simple text that suits early and emerging readers.
const BOOKS = [
  'come-back-cat', 'sbus-special-shoes', 'what-is-it', 'shongololos-shoes', 'a-house-for-mouse', 'who-is-our-friend',
  'is-there-anyone-like-me', 'i-will-help-you', 'little-sock', 'a-beautiful-day', 'rafikis-style', 'whose-button-is-this',
  'what-if', 'when-i-grow-up', 'the-best-thing-ever', 'grandpas-gold', 'hippo-wants-to-dance', 'little-ants-big-plan',
  'lara-the-yellow-ladybird', 'thatos-birthday-surprise', 'sleepy-mr-sloth', 'walking-together', 'bathtub-safari',
  'how-about-you', 'why-is-nita-upside-down', 'karabos-question',
];

// Simple YAML reader for the flat per-book blocks in _data/meta.yml.
const meta = {};
let cur = null;
for (const line of fs.readFileSync(path.join(src, '_data/meta.yml'), 'utf8').split('\n')) {
  const head = /^  ([a-z0-9-]+):\s*$/.exec(line);
  if (head) {
    cur = meta[head[1]] = {};
    continue;
  }
  const kv = /^    (title|creator|description):\s*"(.*)"/.exec(line);
  if (cur && kv) cur[kv[1]] = kv[2];
}

const outJson = path.resolve('src/lib/library/bookdash.json');
const outImg = path.resolve('public/library/bookdash');
fs.rmSync(outImg, { recursive: true, force: true });
const books = [];
for (const slug of BOOKS) {
  const file = path.join(src, slug, 'en', 'index.md');
  const md = fs.readFileSync(file, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  const pages = [];
  let page = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;
    const img = /^!\[.*?\]\(\{\{ site\.image-set \}\}\/([\w.-]+)\)/.exec(line);
    if (img) {
      page = { image: img[1], text: [] };
      pages.push(page);
      continue;
    }
    if (page) page.text.push(line.replace(/\s+$/, '').replace(/\\$/, ''));
  }
  const dir = path.join(outImg, slug);
  fs.mkdirSync(dir, { recursive: true });
  const shrink = (from, to, width) =>
    sharp(from).resize({ width, withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(dir, to));
  const outPages = [];
  for (const [i, p] of pages.entries()) {
    const from = path.join(src, slug, 'en', 'images', p.image);
    let image;
    // Some books in the repository only have their cover; their pages are text only.
    if (fs.existsSync(from)) {
      const name = `${String(i + 1).padStart(2, '0')}.jpg`;
      await shrink(from, name, 720);
      image = `library/bookdash/${slug}/${name}`;
    }
    outPages.push({ text: p.text.join('\n'), image });
  }
  let cover;
  const coverFrom = path.join(src, slug, 'en', 'images', 'cover.jpg');
  if (fs.existsSync(coverFrom)) {
    await shrink(coverFrom, 'cover.jpg', 360);
    cover = `library/bookdash/${slug}/cover.jpg`;
  }
  const m = meta[slug] ?? {};
  const title = (m.title || md.match(/^# (.+)$/m)?.[1] || slug).replace(/’/g, '’');
  books.push({
    id: `bookdash-${slug}`,
    title,
    description: m.description ?? '',
    credit: `${title} by ${m.creator ?? 'Book Dash volunteers'}. Published by Book Dash (bookdash.org) under CC BY 4.0. Picture symbols added.`,
    url: 'https://bookdash.org',
    cover,
    pages: outPages.filter((p) => p.text.trim() || p.image),
  });
  console.log(slug, outPages.length, 'pages,', outPages.filter((p) => p.image).length, 'pictures,', outPages.map((p) => p.text).join(' ').split(/\s+/).filter(Boolean).length, 'words');
}
fs.writeFileSync(outJson, JSON.stringify(books, null, 1));
