// Optional AI helpers using the user's own OpenAI API key (needs internet):
//   • readSentences  – reads each whole sentence and picks the meaning of every word ("on top" not "a top")
//   • readPagePhoto  – reads the story text in a photo of a book page
//   • generatePicture – draws a pictogram for a word that has no symbol
// Everything they produce is saved on the device and works offline afterwards.
import { kvGet, kvSet, putImage, uid } from './db';
import { base64ToBlob, blobToDataUrl, shrinkImage } from './images';
import type { Page, Settings, SymbolRef } from './types';

const API = 'https://api.openai.com/v1';
const TEXT_MODELS = ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'];
const IMAGE_MODELS = ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3'];
const WORKING_TEXT = 'pwb-ai-text-model';
const WORKING_IMAGE = 'pwb-ai-image-model';

export const aiReady = (s: Settings) => s.aiEnabled && !!s.aiKey && navigator.onLine;

class AiError extends Error {
  constructor(
    message: string,
    readonly retryOtherModel = false,
  ) {
    super(message);
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function recall(key: string) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

async function call(path: string, body: unknown, key: string): Promise<any> {
  if (!key) throw new AiError('Add your OpenAI API key in Settings → AI first.');
  if (!navigator.onLine) throw new AiError('AI needs an internet connection.');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('Could not reach OpenAI. Check your internet connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const msg: string = data?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw new AiError('OpenAI did not accept your API key. Check it in Settings → AI.');
  if (res.status === 429)
    throw new AiError(/quota|billing|credit/i.test(msg) ? 'Your OpenAI account is out of credit. Add credit at platform.openai.com → Billing.' : 'OpenAI is busy (rate limit). Try again in a minute.');
  // Model not available to this account (not found, needs organisation verification, unsupported option…)
  const modelProblem = res.status === 404 || /model|verif|does not exist|access|unsupported|not supported|invalid value/i.test(msg);
  throw new AiError(`OpenAI: ${msg}`, modelProblem);
}

/** Try the chosen model, then other common models, remembering the first that works. */
async function withModels<T>(preferred: string, list: string[], memoryKey: string, run: (model: string) => Promise<T>): Promise<T> {
  // The model that worked last time goes first, so a model this account cannot use is not retried for every picture.
  const models = [...new Set([recall(memoryKey), preferred, ...list].filter(Boolean))];
  let last: unknown;
  for (const m of models) {
    try {
      const out = await run(m);
      remember(memoryKey, m);
      return out;
    } catch (e) {
      last = e;
      if (!(e instanceof AiError && e.retryOtherModel)) throw e;
    }
  }
  throw last;
}

async function chatJson(settings: Settings, messages: unknown[]): Promise<any> {
  return withModels(settings.aiTextModel, TEXT_MODELS, WORKING_TEXT, async (model) => {
    const data = await call('/chat/completions', { model, messages, response_format: { type: 'json_object' } }, settings.aiKey);
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError('The AI gave an unreadable answer. Please try again.');
    }
  });
}

// ---------- reading whole sentences ----------

const SENTENCE_PROMPT = `You help make symbol-supported children's books for autistic children who read with AAC picture symbols (PECS / ARASAAC style).
You get the text of one book page with every word numbered. For EVERY numbered word decide which picture should appear above it, based on what the word means in THIS sentence.

Return JSON: {"words":[{"i":<number>,"look":"<search words>","group":<number>,"draw":"<picture description>"}]}

- look: 1–3 simple English words to search a pictogram library for the meaning used here, in base form.
  Examples: "top" in "on top of the table" → "on top"; "top" in "she wore a red top" → "shirt"; "saw" in "I saw a dog" → "see";
  "saw" in "cut with a saw" → "saw"; "bat" in "swing the bat" → "baseball bat"; "bat" in "the bat flew" → "bat animal";
  "park" in "went to the park" → "park"; "ran" → "run"; "mice" → "mouse"; "is" → "be"; "didn't" → "not"; "the" → "the".
  For names of people or pets use "boy", "girl", "dog" etc. as fits the story.
- group: if this word and the following words form ONE idea that should share ONE picture (e.g. "on top of", "ice cream",
  "teddy bear", "fire truck", "thank you", "once upon a time", "next to"), the number of FOLLOWING words included in it; otherwise 0.
  The following words in a group still get an entry with group 0. Never group across punctuation. Never group "the"/"a" with a noun.
- draw: only for nouns, verbs, adjectives and names: a short description of a simple picture showing exactly this meaning,
  e.g. "a cat sitting on top of a table". Leave it out for little words.`;

/**
 * Ask the AI what each word means in its sentence. Sets token.concept / aiGroup / draw.
 * Results are cached per page text, so re-running costs nothing.
 */
export async function readSentences(pages: Page[], settings: Settings, onStatus?: (s: string) => void): Promise<void> {
  let n = 0;
  for (const page of pages) {
    n++;
    if (!page.tokens.length) continue;
    onStatus?.(`AI is reading the sentences… page ${n} of ${pages.length}`);
    const numbered = page.tokens.map((t, i) => `${i}:${t.text}`).join(' ');
    const cacheKey = `ai:ctx:v1:${page.text}`;
    let result = await kvGet<{ words: { i: number; look?: string; group?: number; draw?: string }[] }>(cacheKey);
    if (!result) {
      result = await chatJson(settings, [
        { role: 'system', content: SENTENCE_PROMPT },
        { role: 'user', content: `Page text:\n${page.text}\n\nNumbered words:\n${numbered}` },
      ]);
      if (result?.words) await kvSet(cacheKey, result);
    }
    for (const w of result?.words ?? []) {
      const t = page.tokens[w.i];
      if (!t || t.manual) continue;
      const look = w.look?.toLowerCase().trim();
      t.concept = look && look !== t.key ? look : undefined;
      const group = Math.max(0, Math.min(4, Math.floor(Number(w.group) || 0)));
      t.aiGroup = group && w.i + group < page.tokens.length ? group : undefined;
      t.draw = w.draw?.trim() || undefined;
    }
  }
}

// ---------- reading a page photo ----------

const PHOTO_PROMPT = `This is a photo of a page from a children's picture book. Write out exactly the words of the story printed on the page, in reading order.
Leave out page numbers, headers, copyright lines, and words that are part of the illustration (signs, labels) unless they are part of the story.
Keep the original spelling and punctuation. Put a blank line between separate blocks of text.
If there is no story text, use an empty string. Return JSON: {"text":"..."}`;

export async function readPagePhoto(image: Blob, settings: Settings): Promise<string> {
  const dataUrl = await blobToDataUrl(await shrinkImage(image, 1600, 'image/jpeg', 0.85));
  const out = await chatJson(settings, [
    { role: 'system', content: PHOTO_PROMPT },
    { role: 'user', content: [{ type: 'text', text: 'Read the story text on this page.' }, { type: 'image_url', image_url: { url: dataUrl } }] },
  ]);
  return String(out?.text ?? '').trim();
}

// ---------- drawing a picture ----------

/** Create a pictogram for a word that has no symbol. The finished picture is stored on the device. */
export async function generatePicture(word: string, sentence: string, settings: Settings, draw?: string): Promise<SymbolRef> {
  const subject = draw ? `${draw} (this is the meaning of the word "${word}")` : `the meaning of the word "${word}"` + (sentence ? ` as used in the sentence: "${sentence}"` : '');
  const prompt =
    `A single simple AAC communication pictogram showing ${subject}.` +
    ' Style: like ARASAAC symbols — flat bright colours, thick black outlines, plain white background,' +
    ' one centred subject, friendly and clear for a young autistic child.' +
    ' Absolutely no text, letters or numbers in the image.';

  const blob = await withModels(settings.aiModel, IMAGE_MODELS, WORKING_IMAGE, async (model) => {
    const body: Record<string, unknown> = { model, prompt, size: '1024x1024', n: 1 };
    if (model.startsWith('dall-e')) body.response_format = 'b64_json';
    const data = await call('/images/generations', body, settings.aiKey);
    const item = data?.data?.[0];
    if (item?.b64_json) return base64ToBlob(item.b64_json, 'image/png');
    if (item?.url) return (await fetch(item.url)).blob();
    throw new AiError('The image service did not return a picture.');
  });

  const ref = `u:${uid()}`;
  await putImage(ref, await shrinkImage(blob, 320, 'image/png'), 'ai', word);
  return ref;
}

/** Check the key and report which models this account can use. */
export async function testConnection(settings: Settings): Promise<string> {
  if (!settings.aiKey) throw new Error('Paste your OpenAI API key first.');
  let res: Response;
  try {
    res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${settings.aiKey}` } });
  } catch {
    throw new Error('Could not reach OpenAI. Check your internet connection.');
  }
  if (res.status === 401) throw new Error('OpenAI did not accept this API key.');
  if (!res.ok) throw new Error(`OpenAI returned HTTP ${res.status}.`);
  const ids: string[] = ((await res.json())?.data ?? []).map((m: { id: string }) => m.id);
  const image = IMAGE_MODELS.filter((m) => ids.includes(m));
  const text = TEXT_MODELS.filter((m) => ids.includes(m));
  return `Key works. Drawing models: ${image.join(', ') || 'none found'}. Reading models: ${text.join(', ') || 'none found'}.`;
}
