// Language definitions and the "language pack" planner. Pure logic, no browser APIs.
//
// Design:
//  - Swahili is Noor's core language. Everything Noor reads or hears is Swahili,
//    produced from fixed, human-written templates (no machine translation into Swahili).
//  - English is the pivot: guest feedback is translated <guest language> -> English
//    so one small classifier can sort it into a fixed list of topics.
//  - Each guest language is a downloadable pack: an Opus-MT translation model
//    (<lang> -> English, about 130 MB quantized) plus Tesseract handwriting/print data.
//  - Speech uses one shared multilingual Whisper model, downloaded once.

export const LANGS = {
  sw: { sw: 'Kiswahili', en: 'Swahili', native: 'Kiswahili', tess: 'swa', whisper: 'swahili', mt: null, core: true },
  en: { sw: 'Kiingereza', en: 'English', native: 'English', tess: 'eng', whisper: 'english', mt: null, core: true },
  it: { sw: 'Kiitaliano', en: 'Italian', native: 'Italiano', tess: 'ita', whisper: 'italian', mt: 'Xenova/opus-mt-it-en' },
  fr: { sw: 'Kifaransa', en: 'French', native: 'Français', tess: 'fra', whisper: 'french', mt: 'Xenova/opus-mt-fr-en' },
  de: { sw: 'Kijerumani', en: 'German', native: 'Deutsch', tess: 'deu', whisper: 'german', mt: 'Xenova/opus-mt-de-en' },
  zh: { sw: 'Kichina', en: 'Chinese', native: '中文', tess: 'chi_sim', whisper: 'chinese', mt: 'Xenova/opus-mt-zh-en' },
  es: { sw: 'Kihispania', en: 'Spanish', native: 'Español', tess: 'spa', whisper: 'spanish', mt: 'Xenova/opus-mt-es-en' },
  pl: { sw: 'Kipolandi', en: 'Polish', native: 'Polski', tess: 'pol', whisper: 'polish', mt: 'Xenova/opus-mt-pl-en' },
  nl: { sw: 'Kiholanzi', en: 'Dutch', native: 'Nederlands', tess: 'nld', whisper: 'dutch', mt: 'Xenova/opus-mt-nl-en' },
  ru: { sw: 'Kirusi', en: 'Russian', native: 'Русский', tess: 'rus', whisper: 'russian', mt: 'Xenova/opus-mt-ru-en' },
  ja: { sw: 'Kijapani', en: 'Japanese', native: '日本語', tess: 'jpn', whisper: 'japanese', mt: 'Xenova/opus-mt-ja-en' },
  ko: { sw: 'Kikorea', en: 'Korean', native: '한국어', tess: 'kor', whisper: 'korean', mt: 'Xenova/opus-mt-ko-en' },
};

// Approximate download sizes in MB (quantized ONNX: encoder + merged decoder),
// measured from the Hugging Face file listing for Xenova/opus-mt-it-en.
export const PACK_MB = 130;
export const SHARED_MODELS = {
  voice: { id: 'Xenova/whisper-base', mb: 77, sw: 'Sauti (lugha zote)', en: 'Voice (all languages)' },
  topics: { id: 'Xenova/all-MiniLM-L6-v2', mb: 23, sw: 'Kupanga mada', en: 'Topic sorting' },
  mood: { id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', mb: 67, sw: 'Hisia (nzuri/mbaya)', en: 'Sentiment' },
};

export const KEEP_TOP_N = 3; // plus Swahili and English = 5 "essential" languages

// Used until Noor has her own guest history: the largest non-African, non-English
// source markets for Tanzania in 2024 (National Bureau of Statistics): Italy, France, Germany.
export const DEFAULT_KEEP = ['it', 'fr', 'de'];

export function langName(code, which = 'sw') {
  const l = LANGS[code];
  return l ? l[which] : code;
}

export function packLangs() {
  return Object.keys(LANGS).filter(c => LANGS[c].mt);
}

/**
 * Decide which language packs to keep, download, or offer to delete.
 * @param {Object} p
 * @param {Array<{language:string, visitDate:string}>} p.guests  past guests
 * @param {Array<{language:string, date:string}>} p.bookings     upcoming bookings
 * @param {string[]} p.installed  language codes whose pack is on the phone
 * @param {Date} p.today
 */
export function planPacks({ guests = [], bookings = [], installed = [], today = new Date() }) {
  const day = 24 * 3600 * 1000;
  const t0 = startOfDay(today).getTime();

  // History: how often each guest language appeared (last 12 months).
  const counts = {};
  for (const g of guests) {
    if (!LANGS[g.language] || !LANGS[g.language].mt) continue;
    const d = g.visitDate ? new Date(g.visitDate).getTime() : t0;
    if (t0 - d > 365 * day) continue;
    counts[g.language] = (counts[g.language] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const keep = ranked.slice(0, KEEP_TOP_N);
  const usedDefaults = keep.length < KEEP_TOP_N;
  for (const c of DEFAULT_KEEP) if (keep.length < KEEP_TOP_N && !keep.includes(c)) keep.push(c);

  // Upcoming: languages of bookings in the next 7 days (needed) and 14 days (protect from deletion).
  const next7 = new Set();
  const next14 = new Set();
  for (const b of bookings) {
    if (!LANGS[b.language] || !LANGS[b.language].mt) continue;
    const d = startOfDay(new Date(b.date)).getTime();
    if (d >= t0 && d - t0 <= 7 * day) next7.add(b.language);
    if (d >= t0 && d - t0 <= 14 * day) next14.add(b.language);
  }

  const inst = new Set(installed);
  const download = [...next7].filter(c => !inst.has(c));                      // booked in the next 7 days
  const recommend = keep.filter(c => !inst.has(c) && !next7.has(c));          // common languages, when there is Wi-Fi
  const removable = [...inst].filter(c => !keep.includes(c) && !next14.has(c));

  return {
    counts,
    keep,
    usedDefaults,        // true when national statistics filled gaps in Noor's own history
    needed: [...next7],
    download,            // needed before booked guests arrive (Noor or helper confirms; costs data)
    recommend,           // the kept common languages not yet on the phone
    removable,           // rare packs that can be deleted to free space (confirm first)
    downloadMB: download.length * PACK_MB,
    recommendMB: recommend.length * PACK_MB,
    freeMB: removable.length * PACK_MB,
  };
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
