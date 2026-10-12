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
    // Simple pictograms look fine at the cheapest quality (about 1¢ a picture instead of up to ~17¢).
    if (model.startsWith('dall-e')) {
      body.response_format = 'b64_json';
      if (model === 'dall-e-3') body.quality = 'standard';
    } else body.quality = 'low';
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

// ---------- writing a new story ----------

export interface StoryRequest {
  topic: string;
  childName?: string;
  kind: 'fun' | 'social';
  /** 1 = first words, 2 = short sentences, 3 = longer story */
  level: 1 | 2 | 3;
  pages: number;
  include?: string;
}

const LEVEL_RULES = {
  1: 'Each page has ONE very short sentence of 2 to 5 words (e.g. "The dog runs."). Use only the most common, concrete words.',
  2: 'Each page has 1 or 2 short sentences, up to about 10 words each. Use common, concrete everyday words.',
  3: 'Each page has 2 or 3 sentences, up to about 15 words each. Keep the words simple and concrete.',
};

const STORY_PROMPT = `You write short, age-appropriate books for young children, including autistic children who read with picture symbols (one picture above every word).
Write so every word is easy to show as a picture:
- Use simple, concrete, literal words (things, people, animals, actions, feelings). Avoid idioms, sarcasm, metaphors and figures of speech.
- Use the same words for the same things every time. Repeating a sentence pattern is good.
- Use the present tense.
- Keep it warm, positive and safe: nothing scary, violent, rude or sad without a happy ending. No brand names.
- Write numbers as words. Do not use emoji.
Return JSON: {"title":"...","pages":["page 1 text","page 2 text", ...]}`;

const SOCIAL_RULES = `This is a SOCIAL STORY (Carol Gray style) that helps a child understand and prepare for a situation:
- Write in the first person ("I"), present tense, calm and reassuring.
- Mostly describe what happens, in order, and what people do and feel. Add a few gentle sentences about what I can do ("I can…"), never "I must" or "I will not".
- Mention sensations that may feel different (sounds, waiting, touch) and a simple way to cope (ask for a break, take a deep breath, hold a toy).
- End with a positive sentence.`;

/** Ask the AI to write a new picture-friendly book. Needs the AI helper turned on, with an OpenAI key. */
export async function writeStory(req: StoryRequest, settings: Settings): Promise<{ title: string; pages: string[] }> {
  const n = Math.max(3, Math.min(16, Math.round(req.pages)));
  const ask =
    `Write a ${req.kind === 'social' ? 'social story' : 'fun story'} about: ${req.topic.trim()}.\n` +
    (req.childName?.trim() ? `The main character is a child called ${req.childName.trim()}${req.kind === 'social' ? ' (still write in the first person "I")' : ''}.\n` : '') +
    (req.include?.trim() ? `Please include: ${req.include.trim()}.\n` : '') +
    `Exactly ${n} pages. ${LEVEL_RULES[req.level]}`;
  const out = await chatJson(settings, [
    { role: 'system', content: STORY_PROMPT + (req.kind === 'social' ? '\n\n' + SOCIAL_RULES : '') },
    { role: 'user', content: ask },
  ]);
  const pages: string[] = (Array.isArray(out?.pages) ? out.pages : []).map((p: unknown) => String(p).trim()).filter(Boolean);
  if (!pages.length) throw new Error('The AI did not write a story. Please try again.');
  return { title: String(out?.title ?? req.topic).trim() || 'My story', pages };
}
