import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { canvasToBlob } from '../images';
import { cleanOcrText } from '../text';
import { readImageText } from './ocr';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ImportedPage {
  text: string;
  image?: Blob;
}

/** One book page per PDF page. Scanned pages without a text layer are read with OCR. */
export async function importPdf(file: File, onStatus: (s: string) => void): Promise<ImportedPage[]> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: ImportedPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onStatus(`Reading page ${n} of ${doc.numPages}…`);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : '');
    }
    // A picture of the page, so the reader can show the original illustration.
    const viewport = page.getViewport({ scale: Math.min(2, 1400 / page.getViewport({ scale: 1 }).width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    text = cleanOcrText(text);
    if (text.replace(/\W/g, '').length < 3) {
      onStatus(`Page ${n} is a scan — reading the words with OCR…`);
      text = (await readImageText(canvas)).text;
    }
    pages.push({ text, image: await canvasToBlob(canvas, 'image/jpeg', 0.8) });
  }
  return pages;
}
