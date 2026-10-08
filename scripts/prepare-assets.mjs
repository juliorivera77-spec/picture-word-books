// Copies the OCR engine (tesseract.js worker, WASM core and English language data)
// into public/ocr so the app can read photos of pages with no internet connection.
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('public/ocr');
fs.mkdirSync(path.join(out, 'core'), { recursive: true });
const nm = (p) => path.resolve('node_modules', p);
const copy = (from, to) => {
  const dest = path.join(out, to);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(from).size) fs.copyFileSync(from, dest);
};

copy(nm('tesseract.js/dist/worker.min.js'), 'worker.min.js');
// Only the LSTM builds are needed (we always run with lstmOnly); the .wasm.js files embed the WASM.
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copy(nm(`tesseract.js-core/${f}`), `core/${f}`);
}
copy(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz');
console.log('OCR assets ready in public/ocr');
