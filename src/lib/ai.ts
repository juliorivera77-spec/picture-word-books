import { uid, putImage } from './db';
import { base64ToBlob, shrinkImage } from './images';
import type { Settings, SymbolRef } from './types';

/**
 * Create a pictogram for a word that has no symbol, using the OpenAI Images API.
 * Only used when the user turned it on and added their own API key; needs internet.
 * The finished picture is stored on the device, so it works offline afterwards.
 */
export async function generatePicture(word: string, sentence: string, settings: Settings): Promise<SymbolRef> {
  if (!settings.aiKey) throw new Error('Add your OpenAI API key in Settings first.');
  if (!navigator.onLine) throw new Error('AI pictures need an internet connection.');

  const prompt =
    `A single simple AAC communication pictogram that shows the meaning of the word "${word}"` +
    (sentence ? ` as used in the children's book sentence: "${sentence}".` : '.') +
    ' Style: like ARASAAC symbols — flat bright colours, thick black outlines, plain white background,' +
    ' one centred subject, friendly and clear for a young child with autism.' +
    ' Absolutely no text, letters or numbers in the image.';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiKey}` },
    body: JSON.stringify({ model: settings.aiModel || 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `The image service returned HTTP ${res.status}`);

  const item = data?.data?.[0];
  let blob: Blob;
  if (item?.b64_json) blob = base64ToBlob(item.b64_json, 'image/png');
  else if (item?.url) blob = await (await fetch(item.url)).blob();
  else throw new Error('The image service did not return a picture.');

  const ref = `u:${uid()}`;
  await putImage(ref, await shrinkImage(blob, 320, 'image/png'), 'ai', word);
  return ref;
}
