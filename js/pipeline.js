// One feedback entry -> English pivot -> clauses -> topic + sentiment (+ "not sure" flags).

import { toEnglish, classifyTopics, sentiments, decideMood } from './ai.js';
import { splitClauses, findProducts } from './topics.js';

/**
 * @param {Object} input
 * @param {string} input.original  text in the guest's language
 * @param {string} input.lang      guest language code
 * @param {'liked'|'improve'|'unknown'} input.box  which guestbook box the text came from
 * @param {string} [input.english] already-translated English (voice notes use Whisper's own translation)
 * @param {(p:Object)=>void} [onProgress]
 */
export async function analyze(input, onProgress) {
  const { original, lang, box } = input;
  if (lang === 'sw') {
    // Noor reads Swahili herself; no translation model into or out of Swahili is used.
    return { english: '', sentences: [], products: [], status: 'swahili' };
  }

  let pairs;
  if (input.english) {
    pairs = [{ original: null, en: input.english }];
  } else {
    const tr = await toEnglish(original, lang, onProgress);
    pairs = tr.pairs;
  }

  const clauses = [];
  for (const p of pairs) {
    for (const c of splitClauses(p.en)) clauses.push({ en: c, original: p.original });
  }
  const english = pairs.map(p => p.en).join(' ').trim();
  if (!clauses.length) {
    return { english, sentences: [], products: findProducts(english), status: 'analyzed' };
  }

  const texts = clauses.map(c => c.en);
  const topics = await classifyTopics(texts, onProgress);
  const moods = await sentiments(texts, onProgress);

  const sentences = clauses.map((c, i) => {
    const mood = decideMood(box, moods[i]);
    const flags = [...mood.flags];
    if (topics[i].topic === 'other') flags.push('topic-unsure');
    return {
      en: c.en,
      original: c.original,
      topic: topics[i].topic,
      topicScore: topics[i].score,
      runnerUp: topics[i].runnerUp,
      sentiment: mood.sentiment,
      moodScore: moods[i]?.score ?? null,
      modelMood: moods[i]?.label ?? null,
      flags,
      confirmed: false,
    };
  });

  return { english, sentences, products: findProducts(english), status: 'analyzed' };
}
