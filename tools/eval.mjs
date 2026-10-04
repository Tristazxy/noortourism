// Accuracy check, run automatically by GitHub Actions (.github/workflows/eval.yml).
// Uses the SAME classification code as the app (src/ai.js), with the npm build of the AI library.
//
// 1. Topic sorting on a labeled synthetic test set (public/data/eval-set.json)
// 2. Sentiment on the same set
// 3. Translation packs on synthetic guest-style sentences (chrF) + topic accuracy after translation
// 4. Translation packs on the published FLORES-200 benchmark (devtest, first N sentences, chrF)
//
// Writes public/data/eval-results.json (shown on eval.html) and a summary for the Actions page.

import * as T from '@huggingface/transformers';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { setTransformers, classifyTopics, sentiments, toEnglish, releaseTranslation, TOPIC_MIN, MOOD_MIN } from '../src/ai.js';
import { scoreTopics, scoreMood, corpusChrF } from '../src/evalcore.js';
import { LANGS, SHARED_MODELS } from '../src/langs.js';

T.env.allowLocalModels = false;
T.env.cacheDir = process.env.MODEL_CACHE || '.cache/models';
setTransformers(T);

const t0 = Date.now();
const set = JSON.parse(await readFile('public/data/eval-set.json', 'utf8'));
const out = {
  generated: new Date().toISOString(),
  runner: 'GitHub Actions (CPU, onnxruntime-node); same code as the app',
  thresholds: { topicMin: TOPIC_MIN, moodMin: MOOD_MIN },
  models: { topics: SHARED_MODELS.topics.id, mood: SHARED_MODELS.mood.id },
  testSet: 'synthetic, written by the team (see _note in eval-set.json)',
};

// 1-2. Topics and sentiment on the labeled set
const texts = set.topics.map(t => t.text);
const topicPreds = await classifyTopics(texts);
out.topics = scoreTopics(set.topics, topicPreds);
const moodPreds = await sentiments(texts);
out.mood = scoreMood(set.topics, moodPreds, MOOD_MIN);
console.log('topics', out.topics.accuracy, 'mood', out.mood.accuracy);

// 3-4. Per language pack: synthetic guest-style sentences, then FLORES-200 devtest
// (published benchmark; only scores are kept, the data is not redistributed).
const N = Number(process.env.FLORES_N || 100);
const FL = { it: 'ita_Latn', fr: 'fra_Latn', de: 'deu_Latn', zh: 'zho_Hans', es: 'spa_Latn', pl: 'pol_Latn' };
let floresDir = null;
try {
  const base = '.cache/flores';
  if (!existsSync(`${base}/flores200_dataset`)) {
    await mkdir(base, { recursive: true });
    execSync(`curl -sSL --fail -o ${base}/flores.tar.gz https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz && tar -xzf ${base}/flores.tar.gz -C ${base}`, { stdio: 'inherit' });
  }
  floresDir = `${base}/flores200_dataset/devtest`;
  out.flores = { benchmark: 'FLORES-200', split: 'devtest', sentences: N, direction: 'guest language -> English', license: 'CC BY-SA 4.0', results: {} };
} catch (err) {
  out.flores = { error: String(err.message || err) };
}
const floresRef = floresDir ? (await readFile(`${floresDir}/eng_Latn.devtest`, 'utf8')).split('\n').slice(0, N) : null;

out.translation = {};
for (const [lang, rows] of Object.entries(set.translation)) {
  const hyps = [];
  for (const r of rows) hyps.push((await toEnglish(r.src, lang)).english);
  const labeled = rows.map((r, i) => ({ r, h: hyps[i] })).filter(x => x.r.topic);
  const tp = await classifyTopics(labeled.map(x => x.h));
  const correct = tp.filter((p, i) => p.topic === labeled[i].r.topic).length;
  out.translation[lang] = {
    model: LANGS[lang].mt,
    chrF: corpusChrF(hyps, rows.map(r => r.ref)),
    topicAfterTranslation: { correct, total: labeled.length },
    samples: rows.map((r, i) => ({ src: r.src, ref: r.ref, hyp: hyps[i] })),
  };
  console.log('synthetic', lang, out.translation[lang].chrF);

  if (floresRef && FL[lang]) {
    try {
      const src = (await readFile(`${floresDir}/${FL[lang]}.devtest`, 'utf8')).split('\n').slice(0, N);
      const fh = [];
      for (const s of src) fh.push((await toEnglish(s, lang)).english);
      out.flores.results[lang] = { model: LANGS[lang].mt, chrF: corpusChrF(fh, floresRef) };
      console.log('FLORES', lang, out.flores.results[lang].chrF);
    } catch (err) {
      out.flores.results[lang] = { error: String(err.message || err) };
    }
  }
  await releaseTranslation(lang);
}

out.seconds = Math.round((Date.now() - t0) / 1000);
await writeFile('public/data/eval-results.json', JSON.stringify(out, null, 1));

// Human-readable summary on the Actions run page
const lines = [
  '## Accuracy check',
  '',
  `Topic sorting (synthetic set, n=${out.topics.n}): accuracy ${out.topics.accuracy}% · precision when answered ${out.topics.precisionWhenAnswered}% · answered ${out.topics.coverage}% · said "not sure" on off-topic ${out.topics.abstainOnOther}%`,
  `Sentiment (n=${out.mood.n}): accuracy ${out.mood.accuracy}% · precision when answered ${out.mood.precisionWhenAnswered}% · answered ${out.mood.coverage}%`,
  '',
  '| Language | Model | chrF synthetic | Topic after translation | chrF FLORES-200 devtest |',
  '|---|---|---|---|---|',
  ...Object.entries(out.translation).map(([l, r]) => `| ${LANGS[l].en} | ${r.model} | ${r.chrF} | ${r.topicAfterTranslation.correct}/${r.topicAfterTranslation.total} | ${out.flores?.results?.[l]?.chrF ?? '—'} |`),
  '',
  out.flores?.error ? `FLORES-200 not run: ${out.flores.error}` : `FLORES-200: first ${N} devtest sentences per language.`,
];
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log(lines.join('\n'));
