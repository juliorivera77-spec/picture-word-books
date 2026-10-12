// One-off: import illustrated public-domain classics from Project Gutenberg (via GITenberg on GitHub)
// with their original pictures.
//   NODE_PATH=<dir with sharp> node scripts/build-classics.mjs /path/to/folder-with-GITenberg-clones
// Writes src/lib/library/classics.json and public/library/classic/<book>/*.jpg
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');
const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node scripts/build-classics.mjs /path/to/clones');
const OUT = path.resolve('public/library/classic');

const unescape = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
const clean = (h) => unescape(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const words = (s) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);

async function saveImage(file, dest, width = 640) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(file).resize({ width, withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 72, mozjpeg: true }).toFile(dest);
}

/** Prefer the full-size picture the thumbnail links to ("04-tb.jpg" → "04.jpg"). */
function bestImage(dir, src) {
  const full = src.replace(/-tb(\.\w+)$/, '$1');
  return fs.existsSync(path.join(dir, full)) ? full : src;
}

// ---------- Beatrix Potter style books: paragraphs with pictures between them ----------
async function importStory({ repo, id, title, description, author, start, skipImages = [] }) {
  const dir = fs.readdirSync(path.join(SRC, repo)).find((d) => d.endsWith('-h'));
  const base = path.join(SRC, repo, dir);
  const html = fs.readFileSync(path.join(base, fs.readdirSync(base).find((f) => /\.html?$/.test(f))), 'latin1');
  const body = html.slice(html.indexOf(start), html.search(/End of (the )?Project Gutenberg/i));
  // Sequence of pictures and paragraphs, in reading order.
  const seq = [];
  const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? '';
  const addImg = (tag) => {
    const src = attr(tag, 'src').replace(/^\.\//, '');
    if (src && !skipImages.some((s) => src.includes(s))) seq.push({ img: src, alt: unescape(attr(tag, 'alt') || attr(tag, 'title')) });
  };
  for (const m of body.matchAll(/(<img[^>]*>)|<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (m[1]) addImg(m[1]);
    else {
      for (const im of m[2].matchAll(/<img[^>]*>/gi)) addImg(im[0]);
      const t = clean(m[2]).replace(/\n/g, ' ');
      if (t) seq.push({ text: t });
    }
  }
  // Does each picture belong to the text before it or after it? Decide for the whole book by
  // comparing picture captions with the neighbouring text.
  let before = 0;
  let after = 0;
  seq.forEach((x, i) => {
    if (!x.img || !x.alt) return;
    const a = words(x.alt);
    const prev = seq.slice(0, i).reverse().find((y) => y.text);
    const next = seq.slice(i + 1).find((y) => y.text);
    const score = (t) => (t ? [...words(t.text)].filter((w) => a.has(w)).length : 0);
    after += score(prev); // picture comes after its text
    before += score(next); // picture comes before its text
  });
  const pictureFirst = before >= after;
  const pages = [];
  let cur = { text: [], img: undefined };
  const flush = () => {
    if (cur.text.length || cur.img) pages.push(cur);
    cur = { text: [], img: undefined };
  };
  for (const x of seq) {
    if (x.img) {
      if (pictureFirst) {
        flush();
        cur.img = x.img;
      } else if (cur.img || !cur.text.length) {
        flush();
        cur.img = x.img; // a second picture for the same text gets a page of its own
        flush();
      } else {
        cur.img = x.img;
        flush();
      }
    } else cur.text.push(x.text);
  }
  flush();
  const out = [];
  let n = 0;
  for (const p of pages) {
    let image;
    if (p.img) {
      const name = `${String(++n).padStart(2, '0')}.jpg`;
      await saveImage(path.join(base, bestImage(base, p.img)), path.join(OUT, id, name));
      image = `library/classic/${id}/${name}`;
    }
    out.push({ text: p.text.join('\n'), image });
  }
  const cover = out.find((p) => p.image)?.image;
  console.log(`${id}: ${out.length} pages, ${n} pictures (pictures ${pictureFirst ? 'before' : 'after'} text; score ${before}/${after})`);
  return {
    id: `classic-${id}`,
    title,
    description,
    credit: `${title} by ${author}. Public domain, from Project Gutenberg. Picture symbols added.`,
    url: `https://www.gutenberg.org/ebooks/${repo.split('_').pop()}`,
    cover,
    level: 3,
    pages: out.filter((p) => p.text.trim() || p.image),
  };
}

// ---------- The Real Mother Goose: one rhyme (and its picture) per page ----------
async function importMotherGoose(books) {
  const repo = 'The-Real-Mother-Goose_10607';
  const base = path.join(SRC, repo, '10607-h');
  const html = fs.readFileSync(path.join(base, '10607-h.htm'), 'latin1');
  // Each rhyme lives in a table cell with an optional picture.
  const rhymes = new Map();
  for (const table of html.split(/<table/i).slice(1)) {
    for (const poem of table.split(/<div class="poem"/i).slice(1)) {
      const title = /<div class="boldtitle">([\s\S]*?)<\/div>/i.exec(poem);
      if (!title) continue;
      const name = clean(title[1]).toUpperCase();
      const body = poem.slice(poem.indexOf(title[0]) + title[0].length).split(/<\/td>/i)[0];
      const img = /href="images\/([^"]+)"/i.exec(poem) ?? /src="images\/([^"]+)"/i.exec(poem) ?? /href="images\/([^"]+)"/i.exec(table);
      if (!rhymes.has(name)) rhymes.set(name, { text: clean(body), img: img?.[1] });
    }
  }
  const out = [];
  for (const b of books) {
    const pages = [];
    for (const t of b.rhymes) {
      const r = rhymes.get(t);
      if (!r) throw new Error(`Mother Goose: no rhyme called ${t}`);
      let image;
      if (r.img) {
        const name = `${t.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}.jpg`;
        await saveImage(path.join(base, 'images', r.img), path.join(OUT, 'mother-goose', name), 560);
        image = `library/classic/mother-goose/${name}`;
      }
      pages.push({ text: r.text, image });
    }
    out.push({
      id: `classic-${b.id}`,
      title: b.title,
      description: b.description,
      credit: `Rhymes and pictures from The Real Mother Goose, illustrated by Blanche Fisher Wright (1916). Public domain, from Project Gutenberg. Picture symbols added.`,
      url: 'https://www.gutenberg.org/ebooks/10607',
      cover: pages.find((p) => p.image)?.image,
      category: 'rhyme',
      level: 1,
      pages,
    });
    console.log(`${b.id}: ${pages.length} rhymes, ${pages.filter((p) => p.image).length} pictures`);
  }
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });
const classics = [];
const potter = 'Beatrix Potter';
classics.push(
  await importStory({ repo: 'The-Tale-of-Peter-Rabbit_14838', id: 'peter-rabbit', title: 'The Tale of Peter Rabbit', author: potter, start: 'Once upon a time', description: 'Peter does not listen to his mother and goes into Mr. McGregor’s garden. The original story and pictures.' }),
  await importStory({ repo: 'The-Tale-of-Benjamin-Bunny_14407', id: 'benjamin-bunny', title: 'The Tale of Benjamin Bunny', author: potter, start: 'One morning a little rabbit', skipImages: ['title', 'emblem'], description: 'Benjamin and his cousin Peter go back to Mr. McGregor’s garden to get Peter’s clothes.' }),
  await importStory({ repo: 'The-Tale-of-Tom-Kitten_14837', id: 'tom-kitten', title: 'The Tale of Tom Kitten', author: potter, start: 'Once upon a time there were three little kittens', skipImages: ['title', 'emblem', 'cover'], description: 'Three kittens get dressed up for visitors — and get very messy.' }),
  await importStory({ repo: 'The-Tale-of-Jemima-Puddle-Duck_14814', id: 'jemima-puddle-duck', title: 'The Tale of Jemima Puddle-Duck', author: potter, start: 'What a funny sight', skipImages: ['title', 'emblem', 'cover'], description: 'Jemima the duck looks for a safe place to lay her eggs.' }),
  await importStory({ repo: 'The-Tale-of-Johnny-Town-Mouse_15284', id: 'johnny-town-mouse', title: 'The Tale of Johnny Town-Mouse', author: potter, start: 'Johnny Town-mouse was born', skipImages: ['title', 'emblem', 'cover'], description: 'A country mouse visits the town, and a town mouse visits the country.' }),
);
classics.push(
  ...(await importMotherGoose([
    {
      id: 'mother-goose-1',
      title: 'Mother Goose: Jack and Jill',
      description: 'Ten favourite nursery rhymes with their original pictures.',
      rhymes: ['JACK AND JILL', 'MISS MUFFET', 'HUMPTY DUMPTY', 'BAA, BAA, BLACK SHEEP', 'LITTLE BOY BLUE', 'THE CAT AND THE FIDDLE', 'A STAR', 'PAT-A-CAKE', 'LITTLE JACK HORNER', 'THREE BLIND MICE'],
    },
    {
      id: 'mother-goose-2',
      title: 'Mother Goose: Old King Cole',
      description: 'More nursery rhymes with their original pictures.',
      rhymes: ['OLD KING COLE', 'SING A SONG OF SIXPENCE', 'MARY, MARY, QUITE CONTRARY', 'JACK SPRAT', 'WEE WILLIE WINKIE', 'GEORGY PORGY', 'SEE-SAW', 'HOT-CROSS BUNS', 'PEASE PORRIDGE', 'LITTLE TOM TUCKER'],
    },
    {
      id: 'mother-goose-3',
      title: 'Mother Goose: Ring a Ring o’ Roses',
      description: 'Rhymes for counting, clapping and bedtime.',
      rhymes: ["RING A RING O' ROSES", 'ONE, TWO, BUCKLE MY SHOE', 'PETER PIPER', 'DIDDLE DIDDLE DUMPLING', "TOM, TOM, THE PIPER'S SON", 'LADYBIRD', 'BYE, BABY BUNTING', 'ROCK-A-BYE, BABY', 'TO MARKET', 'HUSH-A-BYE'],
    },
  ])),
);
fs.writeFileSync(path.resolve('src/lib/library/classics.json'), JSON.stringify(classics, null, 1));

// ---------- Pictures by L. Leslie Brooke for the retold tales in src/lib/library/written.ts ----------
// One entry per page of the retelling; null where no original picture fits that page.
const BROOKE = {
  'three-little-pigs': {
    repo: 'The-Story-of-the-Three-Little-Pigs_18155/18155-h/images',
    pages: ['imgplate-1.jpg', 'img003.jpg', null, 'imgplate-3.jpg', 'imgplate-2.jpg', 'img004.jpg', 'img006.jpg', 'img014.jpg'],
  },
  goldilocks: {
    repo: 'The-Golden-Goose-Book_15661/15661-h/images',
    pages: ['g0030.jpg', null, 'g0036.jpg', null, 'g0039.jpg', 'g0040.jpg', 'g0046.jpg', 'g0049.jpg'],
  },
};
const brooke = {};
for (const [id, b] of Object.entries(BROOKE)) {
  brooke[id] = [];
  for (const [i, f] of b.pages.entries()) {
    if (!f) {
      brooke[id].push(null);
      continue;
    }
    const name = `${String(i + 1).padStart(2, '0')}.jpg`;
    await saveImage(path.join(SRC, b.repo, f), path.join(OUT, `brooke-${id}`, name));
    brooke[id].push(`library/classic/brooke-${id}/${name}`);
  }
}
fs.writeFileSync(path.resolve('src/lib/library/brooke-pictures.json'), JSON.stringify(brooke, null, 1));
console.log('brooke pictures:', Object.keys(brooke).join(', '));
