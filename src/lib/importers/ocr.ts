import { createWorker, PSM, type Worker } from 'tesseract.js';
import { cleanOcrText } from '../text';

// The OCR engine and English data are bundled under /ocr, so photos can be read offline.
const asset = (p: string) => new URL(`${import.meta.env.BASE_URL}ocr/${p}`, document.baseURI).href;

let workerPromise: Promise<Worker> | null = null;
let progressCb: ((p: number) => void) | null = null;

function getWorker() {
  workerPromise ??= createWorker('eng', 1, {
    workerPath: asset('worker.min.js'),
    corePath: asset('core/'),
    langPath: asset('').replace(/\/$/, ''),
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text') progressCb?.(m.progress);
    },
  }).catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/**
 * Prepare a phone photo for reading: turn it the right way up (phone photos are often stored sideways),
 * resize, convert to grey and stretch the contrast so text on coloured pages stands out.
 */
export async function preparePhoto(image: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  if (image instanceof HTMLCanvasElement) {
    src = image;
    w = image.width;
    h = image.height;
  } else {
    const bmp = await createImageBitmap(image, { imageOrientation: 'from-image' });
    src = bmp;
    w = bmp.width;
    h = bmp.height;
  }
  // Text reads best when letters are ~30px tall: aim for a 2000px long side.
  const scale = Math.min(2.5, 2000 / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    hist[g | 0]++;
  }
  // Contrast stretch between the 2nd and 98th percentile.
  const total = cw * ch;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v++) if ((acc += hist[v]) > total * 0.02) { lo = v; break; }
  for (let acc = 0, v = 255; v >= 0; v--) if ((acc += hist[v]) > total * 0.02) { hi = v; break; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  const angle = skewAngle(d, cw, ch);
  return Math.abs(angle) < 0.3 ? canvas : rotate(canvas, angle);
}

/**
 * Estimate how many degrees the text is tilted: try small rotations and keep the one where dark pixels
 * line up into the sharpest rows (classic projection-profile deskew).
 */
function skewAngle(gray: Uint8ClampedArray, w: number, h: number): number {
  const step = Math.max(1, Math.round(Math.max(w, h) / 700));
  const pts: number[] = [];
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) if (gray[(y * w + x) * 4] < 110) pts.push(x, y);
  if (pts.length < 200) return 0;
  let best = 0;
  let bestScore = -1;
  const rows = new Float64Array(Math.ceil((w + h) / step) + 2);
  for (let deg = -8; deg <= 8; deg += 0.5) {
    const r = (deg * Math.PI) / 180;
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    rows.fill(0);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.round((pts[i + 1] * cos - pts[i] * sin) / step + w / step);
      if (yy >= 0 && yy < rows.length) rows[yy]++;
    }
    let score = 0;
    for (let i = 1; i < rows.length; i++) score += (rows[i] - rows[i - 1]) ** 2;
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}

function rotate(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const r = (deg * Math.PI) / 180;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-r);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
interface OcrWord { text: string; confidence: number; bbox: Box }
interface OcrLine { text: string; confidence: number; words: OcrWord[]; bbox: Box }

/**
 * Lines in reading order. Tesseract sometimes splits one printed line into separate blocks
 * (e.g. when an illustration sits beside it), so pieces on the same row are joined left to right,
 * and a bigger vertical gap starts a new paragraph.
 */
function linesOf(data: { blocks?: { paragraphs: { lines: OcrLine[] }[] }[] | null }): OcrLine[][] {
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).filter((l) => l.words.length);
  lines.sort((a, b) => a.bbox.y0 + a.bbox.y1 - (b.bbox.y0 + b.bbox.y1));
  const rows: OcrLine[][] = [];
  for (const l of lines) {
    const row = rows[rows.length - 1];
    const mid = (l.bbox.y0 + l.bbox.y1) / 2;
    const ref = row?.[0];
    if (ref && mid > ref.bbox.y0 && mid < ref.bbox.y1) row.push(l);
    else rows.push([l]);
  }
  const merged: OcrLine[] = rows.map((row) => {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const words = row.flatMap((l) => l.words);
    return {
      text: words.map((w) => w.text).join(' '),
      confidence: row.reduce((n, l) => n + l.confidence * l.words.length, 0) / words.length,
      words,
      bbox: { x0: row[0].bbox.x0, x1: row[row.length - 1].bbox.x1, y0: Math.min(...row.map((l) => l.bbox.y0)), y1: Math.max(...row.map((l) => l.bbox.y1)) },
    };
  });
  const paras: OcrLine[][] = [];
  merged.forEach((l, i) => {
    const prev = merged[i - 1];
    const height = l.bbox.y1 - l.bbox.y0;
    if (!prev || l.bbox.y0 - prev.bbox.y1 > height * 0.9) paras.push([l]);
    else paras[paras.length - 1].push(l);
  });
  return paras;
}

// Symbols Tesseract confuses with letters in storybook fonts.
const LOOKALIKE: Record<string, string> = { '€': 'c', '¢': 'c', '©': 'c', '(': 'c', '£': 'e', '®': 'r', '|': 'l', '!': 'l', '1': 'l', '0': 'o', '$': 's', '§': 's' };

/** A first letter misread as a symbol and split off ("€ at" → "cat"): join it back on. */
function fixSplitLetters(line: OcrLine) {
  const out: OcrWord[] = [];
  const words = line.words;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const letter = LOOKALIKE[w.text] ?? (/^[a-z]$/i.test(w.text) && !/^[aAI]$/.test(w.text) ? w.text : undefined);
    const height = w.bbox.y1 - w.bbox.y0;
    if (letter && next && /^[a-z]/.test(next.text) && next.bbox.x0 - w.bbox.x1 < height * 0.35) {
      out.push({ ...next, text: letter.toLowerCase() + next.text, confidence: Math.min(next.confidence, 70), bbox: { ...next.bbox, x0: w.bbox.x0 } });
      i++;
    } else out.push(w);
  }
  line.words = out;
}

/** Keep only lines that look like real words read with reasonable confidence; drop picture noise. */
function keepGoodText(paragraphs: OcrLine[][]): { text: string; confidence: number; words: number } {
  let confSum = 0;
  let count = 0;
  const paras: string[] = [];
  for (const lines of paragraphs) {
    const kept: string[] = [];
    for (const line of lines) {
      fixSplitLetters(line);
      const words = line.words.filter((w) => {
        const letters = w.text.replace(/[^A-Za-z]/g, '').length;
        return w.confidence >= 45 && letters >= Math.max(1, w.text.length * 0.5);
      });
      if (!words.length || line.confidence < 40) continue;
      // A line that is mostly unreadable is usually part of an illustration.
      if (words.length < line.words.length * 0.5) continue;
      for (const w of words) {
        confSum += w.confidence;
        count++;
      }
      kept.push(words.map((w) => w.text).join(' '));
    }
    if (kept.length) paras.push(kept.join('\n'));
  }
  return { text: cleanOcrText(paras.join('\n\n')), confidence: count ? confSum / count : 0, words: count };
}

/**
 * Read the text in a photo of a book page, on the device.
 * `unsure` is true when the reading confidence is low and the user should check the words.
 */
export async function readImageText(
  image: Blob | HTMLCanvasElement,
  onProgress?: (p: number) => void,
): Promise<{ text: string; unsure: boolean }> {
  const worker = await getWorker();
  const canvas = await preparePhoto(image);
  progressCb = (p) => onProgress?.(p * 0.5);
  try {
    // 1) Normal page layout.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const a = keepGoodText(linesOf((await worker.recognize(canvas, {}, { text: true, blocks: true })).data as never));
    if (a.confidence >= 80 && a.words >= 3) return { text: a.text, unsure: false };
    // 2) Picture books often scatter text around the art: try "sparse text" mode and keep the better result.
    progressCb = (p) => onProgress?.(0.5 + p * 0.5);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const b = keepGoodText(linesOf((await worker.recognize(canvas, {}, { text: true, blocks: true })).data as never));
    const score = (r: typeof a) => r.confidence * Math.min(r.words, 40);
    const best = score(b) > score(a) ? b : a;
    return { text: best.text, unsure: best.confidence < 75 };
  } finally {
    progressCb = null;
  }
}
