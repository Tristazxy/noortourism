// Accuracy page: shows the latest automatic results and can re-run the topic and sentiment
// checks right here in the browser with the same on-device models the app uses.

import { classifyTopics, sentiments, MOOD_MIN, TOPIC_MIN } from './ai.js';
import { scoreTopics, scoreMood } from './evalcore.js';
import { topicById } from './topics.js';
import { LANGS } from './langs.js';
import { h, showBusy, progress, hideBusy, toast } from './ui.js';

const root = document.getElementById('eval');

const pct = v => (v === null || v === undefined ? '—' : `${v}%`);

function errorsList(errors) {
  if (!errors?.length) return '<p class="small muted">No errors.</p>';
  return `<ul class="small" style="padding-left:18px">${errors.slice(0, 12).map(e =>
    `<li>“${h(e.text)}” — expected <b>${h(topicById(e.gold).en || e.gold)}</b>, got <b>${h(topicById(e.pred).en || e.pred)}</b>${e.score !== undefined ? ` (${e.score})` : ''}</li>`).join('')}</ul>`;
}

function render(results, local) {
  const r = local || results;
  const tr = results?.translation || {};
  const fl = results?.flores;
  root.innerHTML = `
  <h1>Accuracy check <span class="en">Jaribio la usahihi</span></h1>
  <div class="notice">
    <strong>What is measured</strong>
    The same code the app runs on the phone. Topic sorting and sentiment are scored on a <b>synthetic</b> labeled set written by the team
    (not real guests, so scores may be optimistic). Translation packs are also scored on <b>FLORES-200</b>, a published benchmark.
    When the model is below its confidence threshold the app says “not sure — ask a person” instead of guessing; “answered” shows how often that did not happen.
  </div>

  ${r ? `
  <div class="card">
    <h2>Topic sorting <span class="en">${h(r === local ? 'run in this browser' : `automatic run · ${new Date(results.generated).toLocaleString()}`)}</span></h2>
    <dl class="kv">
      <dt>Items</dt><dd>${r.topics.n}</dd>
      <dt>Accuracy</dt><dd><b>${pct(r.topics.accuracy)}</b></dd>
      <dt>Precision when answered</dt><dd>${pct(r.topics.precisionWhenAnswered)}</dd>
      <dt>Answered (not “not sure”)</dt><dd>${pct(r.topics.coverage)}</dd>
      <dt>Said “not sure” on off-topic text</dt><dd>${pct(r.topics.abstainOnOther)}</dd>
      <dt>Threshold</dt><dd>similarity ≥ ${TOPIC_MIN}</dd>
    </dl>
    <details class="quotes"><summary>Mistakes</summary>${errorsList(r.topics.errors)}</details>
  </div>
  <div class="card">
    <h2>Sentiment <span class="en">when the guestbook box is unknown (voice notes)</span></h2>
    <dl class="kv">
      <dt>Items with a clear mood</dt><dd>${r.mood.n}</dd>
      <dt>Accuracy</dt><dd><b>${pct(r.mood.accuracy)}</b></dd>
      <dt>Precision when answered</dt><dd>${pct(r.mood.precisionWhenAnswered)}</dd>
      <dt>Answered</dt><dd>${pct(r.mood.coverage)}</dd>
      <dt>Threshold</dt><dd>confidence ≥ ${MOOD_MIN}</dd>
    </dl>
  </div>` : `<div class="notice warn">No automatic results yet. They appear after the GitHub accuracy run finishes. You can run the topic and sentiment check here.</div>`}

  ${Object.keys(tr).length ? `
  <div class="card">
    <h2>Translation packs <span class="en">guest language → English</span></h2>
    <p class="small muted">chrF: 0–100, higher is better (character overlap with a reference translation).</p>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <thead><tr><th align="left">Language</th><th align="right">chrF synthetic</th><th align="right">Topic after translation</th><th align="right">chrF FLORES-200</th></tr></thead>
      <tbody>${Object.entries(tr).map(([l, x]) => `
        <tr style="border-top:1px solid var(--line)"><td>${h(LANGS[l]?.en || l)}<div class="small muted">${h(x.model)}</div></td>
        <td align="right">${x.chrF}</td><td align="right">${x.topicAfterTranslation.correct}/${x.topicAfterTranslation.total}</td>
        <td align="right">${fl?.results?.[l]?.chrF ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>
    ${fl?.error ? `<p class="small muted">FLORES-200 was not run: ${h(fl.error)}</p>` : fl ? `<p class="small muted">FLORES-200 ${h(fl.split)}, first ${fl.sentences} sentences per language (CC BY-SA 4.0).</p>` : ''}
    <details class="quotes"><summary>Example translations</summary>
      ${Object.entries(tr).map(([l, x]) => x.samples.slice(0, 3).map(s => `<blockquote class="q"><div class="orig">${h(s.src)}</div><div class="trans">model: ${h(s.hyp)}</div><div class="trans">reference: ${h(s.ref)}</div></blockquote>`).join('')).join('')}
    </details>
  </div>` : ''}

  <div class="card">
    <h2>Run here <span class="en">downloads about 90 MB once (topic + sentiment models)</span></h2>
    <button class="btn block" id="run">Run topic and sentiment check in this browser</button>
  </div>

  <div class="card">
    <h2>Known limits</h2>
    <ul class="small" style="padding-left:18px;margin:0">
      <li>The labeled set is synthetic and small (48 sentences); real guest feedback is needed to confirm these numbers.</li>
      <li>No small, browser-ready translation model covers Swahili or Chagga, so Noor reads Swahili templates, not machine translation.</li>
      <li>Handwriting recognition is not scored here; low-confidence words are always shown to the helper for correction.</li>
    </ul>
  </div>`;

  document.getElementById('run').addEventListener('click', runLocal);
}

let latest = null;

async function runLocal() {
  try {
    const res = await fetch('data/eval-set.json');
    const set = await res.json();
    showBusy('Running topic check');
    const texts = set.topics.map(t => t.text);
    const tp = await classifyTopics(texts, progress);
    showBusy('Running sentiment check');
    const mp = await sentiments(texts, progress);
    hideBusy();
    render(latest, { topics: scoreTopics(set.topics, tp), mood: scoreMood(set.topics, mp, MOOD_MIN) });
  } catch (err) {
    hideBusy();
    toast(`Error: ${err.message}`, 6000);
  }
}

async function start() {
  try {
    const res = await fetch('data/eval-results.json', { cache: 'no-store' });
    latest = res.ok ? await res.json() : null;
  } catch {
    latest = null;
  }
  render(latest, null);
}

start();
