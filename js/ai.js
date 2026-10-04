// On-device AI. Every model runs inside the browser (WebAssembly) after a one-time download,
// then works with no connection. Libraries are pinned so the demo is reproducible.

import { LANGS, SHARED_MODELS } from './langs.js';
import { TOPICS } from './topics.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const FRANC_URL = 'https://cdn.jsdelivr.net/npm/franc-min@6.2.0/+esm';
const CACHE_NAME = 'transformers-cache';

// Thresholds. Below these the app says "not sure — ask a person" instead of guessing.
export const TOPIC_MIN = 0.30;       // cosine similarity to the closest topic example
export const MOOD_MIN = 0.85;        // sentiment confidence when the guestbook box is unknown
export const MOOD_CONFLICT = 0.95;   // model strongly disagrees with the box the guest wrote in
export const OCR_LOW = 70;           // Tesseract word confidence (0-100)

let T = null;
async function tf() {
  if (!T) {
    T = await import(TRANSFORMERS_URL);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
  }
  return T;
}

// ---------- model loading with combined progress ----------
const pipes = new Map();

function progressAggregator(onProgress, label) {
  const files = {};
  return (p) => {
    if (!onProgress) return;
    if (p.status === 'progress' && p.file) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      const vals = Object.values(files);
      const loaded = vals.reduce((a, f) => a + f.loaded, 0);
      const total = vals.reduce((a, f) => a + f.total, 0);
      onProgress({ label, loaded, total, fraction: total ? loaded / total : 0 });
    } else if (p.status === 'ready') {
      onProgress({ label, done: true, fraction: 1 });
    }
  };
}

async function getPipe(task, model, onProgress, label) {
  const key = `${task}|${model}`;
  if (pipes.has(key)) return pipes.get(key);
  const { pipeline } = await tf();
  const p = pipeline(task, model, { dtype: 'q8', progress_callback: progressAggregator(onProgress, label || model) });
  pipes.set(key, p);
  try {
    return await p;
  } catch (err) {
    pipes.delete(key);
    throw err;
  }
}

async function dropPipe(task, model) {
  const key = `${task}|${model}`;
  if (!pipes.has(key)) return;
  try { const p = await pipes.get(key); await p.dispose?.(); } catch { /* ignore */ }
  pipes.delete(key);
}

// ---------- language packs (cache inspection) ----------
export async function isModelCached(model) {
  if (!('caches' in window)) return false;
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const urls = keys.map(k => k.url).filter(u => u.includes(`/${model}/`));
  return urls.some(u => /decoder_model_merged_quantized\.onnx$|model_quantized\.onnx$/.test(u));
}

export async function deleteModel(model) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let n = 0;
  for (const k of keys) {
    if (k.url.includes(`/${model}/`)) { await cache.delete(k); n++; }
  }
  for (const key of [...pipes.keys()]) if (key.endsWith(`|${model}`)) pipes.delete(key);
  return n;
}

export async function installedPacks() {
  const out = [];
  for (const [code, l] of Object.entries(LANGS)) {
    if (l.mt && await isModelCached(l.mt)) out.push(code);
  }
  return out;
}

export async function downloadPack(code, onProgress) {
  const l = LANGS[code];
  if (!l || !l.mt) return;
  await getPipe('translation', l.mt, onProgress, `${l.en} pack`);
  await dropPipe('translation', l.mt); // keep files cached, free memory
}

export async function downloadShared(key, onProgress) {
  const m = SHARED_MODELS[key];
  const task = key === 'voice' ? 'automatic-speech-recognition' : key === 'topics' ? 'feature-extraction' : 'text-classification';
  await getPipe(task, m.id, onProgress, m.en);
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usedMB: Math.round(usage / 1e6), quotaMB: Math.round(quota / 1e6) };
}

// ---------- translation (guest language -> English pivot) ----------
function splitSentences(text, lang) {
  const re = lang === 'zh' || lang === 'ja' ? /(?<=[。！？!?])/ : /(?<=[.!?])\s+|\n+/;
  return text.split(re).map(s => s.trim()).filter(Boolean);
}

export async function toEnglish(text, lang, onProgress) {
  if (!text?.trim()) return { english: '', pairs: [] };
  if (lang === 'en') {
    return { english: text.trim(), pairs: splitSentences(text, lang).map(s => ({ original: s, en: s })) };
  }
  const l = LANGS[lang];
  if (!l?.mt) throw new Error(`No translation pack for ${lang}`);
  const tr = await getPipe('translation', l.mt, onProgress, `${l.en} pack`);
  const pairs = [];
  for (const s of splitSentences(text, lang)) {
    const out = await tr(s, { max_new_tokens: 256 });
    pairs.push({ original: s, en: (out[0]?.translation_text || '').trim() });
  }
  return { english: pairs.map(p => p.en).join(' '), pairs };
}

// ---------- speech (Whisper, one model for all languages) ----------
export async function audioToPCM(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  const audio = await ctx.decodeAudioData(buf);
  let data = audio.getChannelData(0);
  if (audio.numberOfChannels > 1) {
    const b = audio.getChannelData(1);
    const mix = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) mix[i] = (data[i] + b[i]) / 2;
    data = mix;
  }
  await ctx.close();
  return data;
}

export async function transcribe(blob, lang, onProgress) {
  const asr = await getPipe('automatic-speech-recognition', SHARED_MODELS.voice.id, onProgress, SHARED_MODELS.voice.en);
  const pcm = await audioToPCM(blob);
  const language = LANGS[lang]?.whisper || 'english';
  const opts = { language, chunk_length_s: 30, stride_length_s: 5 };
  const orig = await asr(pcm, { ...opts, task: 'transcribe' });
  let english = orig.text.trim();
  if (lang !== 'en' && lang !== 'sw') {
    const tr = await asr(pcm, { ...opts, task: 'translate' });
    english = tr.text.trim();
  }
  return { original: orig.text.trim(), english, seconds: pcm.length / 16000 };
}

// ---------- handwriting / print OCR (Tesseract) ----------
let tessLoaded = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessLoaded) {
    tessLoaded = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Could not load OCR engine (first use needs internet).'));
      document.head.appendChild(s);
    });
  }
  return tessLoaded;
}

async function shrinkImage(file, maxSide = 1800) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.25)';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export async function ocr(file, lang, onProgress) {
  const Tesseract = await loadTesseract();
  const code = LANGS[lang]?.tess || 'eng';
  const langs = code === 'eng' ? 'eng' : `${code}+eng`;
  const worker = await Tesseract.createWorker(langs, 1, {
    logger: m => {
      if (!onProgress) return;
      const label = m.status?.includes('recogn') ? 'Kusoma maandishi / Reading text' : 'OCR';
      onProgress({ label, fraction: m.progress || 0 });
    },
  });
  try {
    const img = await shrinkImage(file);
    const { data } = await worker.recognize(img);
    const words = (data.words || []).map(w => ({ text: w.text, conf: Math.round(w.confidence) }));
    const low = words.filter(w => w.conf < OCR_LOW && /\p{L}/u.test(w.text)).map(w => w.text);
    return { text: (data.text || '').trim(), confidence: Math.round(data.confidence || 0), lowWords: [...new Set(low)] };
  } finally {
    await worker.terminate();
  }
}

// ---------- language hint (tiny statistical detector, not a model) ----------
const FRANC_MAP = { eng: 'en', swh: 'sw', ita: 'it', fra: 'fr', deu: 'de', cmn: 'zh', spa: 'es', pol: 'pl', nld: 'nl', rus: 'ru', jpn: 'ja', kor: 'ko' };
let francMod = null;
export async function guessLanguage(text) {
  if (!text || text.trim().length < 12) return null;
  try {
    francMod = francMod || await import(FRANC_URL);
    const code = francMod.franc(text, { only: Object.keys(FRANC_MAP) });
    return FRANC_MAP[code] || null;
  } catch {
    return null;
  }
}

// ---------- topics and sentiment (English pivot, fixed answer list) ----------
let protoCache = null;

async function embed(texts, onProgress) {
  const ex = await getPipe('feature-extraction', SHARED_MODELS.topics.id, onProgress, SHARED_MODELS.topics.en);
  const out = await ex(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

async function protos(onProgress) {
  if (protoCache) return protoCache;
  const flat = [];
  for (const t of TOPICS) for (const p of t.proto) flat.push({ id: t.id, text: p });
  const vecs = await embed(flat.map(f => f.text), onProgress);
  protoCache = flat.map((f, i) => ({ id: f.id, v: vecs[i] }));
  return protoCache;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export async function classifyTopics(clauses, onProgress) {
  if (!clauses.length) return [];
  const P = await protos(onProgress);
  const vecs = await embed(clauses, onProgress);
  return vecs.map(v => {
    const best = {};
    for (const p of P) {
      const s = dot(v, p.v);
      if (!(p.id in best) || s > best[p.id]) best[p.id] = s;
    }
    const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
    const [topId, topScore] = ranked[0];
    return {
      topic: topScore >= TOPIC_MIN ? topId : 'other',
      score: Number(topScore.toFixed(3)),
      runnerUp: ranked[1] ? ranked[1][0] : null,
    };
  });
}

export async function sentiments(clauses, onProgress) {
  if (!clauses.length) return [];
  const clf = await getPipe('text-classification', SHARED_MODELS.mood.id, onProgress, SHARED_MODELS.mood.en);
  const out = [];
  for (const c of clauses) {
    const r = await clf(c);
    const top = Array.isArray(r) ? r[0] : r;
    out.push({ label: top.label === 'POSITIVE' ? 'pos' : 'neg', score: Number(top.score.toFixed(3)) });
  }
  return out;
}

// Decide sentiment using the guestbook box first, the model second.
export function decideMood(box, model) {
  if (box === 'liked' || box === 'improve') {
    const boxMood = box === 'liked' ? 'pos' : 'neg';
    if (model && model.label !== boxMood && model.score >= MOOD_CONFLICT) {
      return { sentiment: 'unsure', flags: ['conflict'] };
    }
    return { sentiment: boxMood, flags: [] };
  }
  if (!model) return { sentiment: 'unsure', flags: ['no-model'] };
  return model.score >= MOOD_MIN ? { sentiment: model.label, flags: [] } : { sentiment: 'unsure', flags: ['low-confidence'] };
}
