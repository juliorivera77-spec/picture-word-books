import { createWorker, type Worker } from 'tesseract.js';
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

/** Read the text in a photo of a book page. */
export async function readImageText(image: Blob | HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getWorker();
  progressCb = onProgress ?? null;
  try {
    const { data } = await worker.recognize(image);
    return cleanOcrText(data.text);
  } finally {
    progressCb = null;
  }
}
