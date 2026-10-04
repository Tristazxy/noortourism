// Plain-Node checks of the app's logic (no browser, no models). Run: npm test
import assert from 'node:assert/strict';
import { planPacks, LANGS, DEFAULT_KEEP } from '../src/langs.js';
import { splitClauses, findProducts, TOPICS } from '../src/topics.js';
import { summarize, needsCheck, guestTopLiked } from '../src/summary.js';
import { summaryText, thankYou, guideReport, weeklySms, strongProduct } from '../src/templates.js';
import { summaryClipIds } from '../src/voice.js';
import { corpusChrF, scoreTopics } from '../src/evalcore.js';
import { decideMood } from '../src/ai.js';
import { readFileSync } from 'node:fs';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };
const day = d => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.toISOString().slice(0, 10)}T12:00:00`; };

test('planner uses national defaults without history', () => {
  const p = planPacks({ guests: [], bookings: [], installed: [] });
  assert.deepEqual(p.keep, DEFAULT_KEEP);
  assert.equal(p.usedDefaults, true);
});

test('planner: history ranks languages, next-week bookings are needed, rare installed packs removable', () => {
  const guests = [...Array(5)].map(() => ({ language: 'zh', visitDate: day(-10) }))
    .concat([...Array(3)].map(() => ({ language: 'it', visitDate: day(-20) })))
    .concat([{ language: 'es', visitDate: day(-30) }, { language: 'es', visitDate: day(-31) }]);
  const bookings = [{ language: 'pl', date: day(3) }, { language: 'en', date: day(4) }];
  const p = planPacks({ guests, bookings, installed: ['ja', 'zh'] });
  assert.deepEqual(p.keep, ['zh', 'it', 'es']);
  assert.ok(p.needed.includes('pl'));
  assert.ok(!p.needed.includes('en'), 'English needs no pack');
  assert.deepEqual(p.download, ['pl']);
  assert.deepEqual(p.recommend, ['it', 'es']);
  assert.deepEqual(p.removable, ['ja']);
});

test('planner protects a pack booked within 14 days', () => {
  const p = planPacks({ guests: [], bookings: [{ language: 'ja', date: day(10) }], installed: ['ja'] });
  assert.ok(!p.removable.includes('ja'));
});

test('clauses split on "but" and sentence ends', () => {
  assert.deepEqual(splitClauses('Great coffee but the toilet was dirty. Lovely views!'),
    ['Great coffee', 'the toilet was dirty.', 'Lovely views!']);
});

test('product keywords', () => {
  assert.deepEqual(findProducts('I would have bought roasted coffee beans and some souvenirs'), ['coffee', 'souvenir']);
  assert.deepEqual(findProducts('The walk was nice'), []);
});

test('mood: box wins unless the model strongly disagrees', () => {
  assert.deepEqual(decideMood('liked', { label: 'pos', score: 0.7 }), { sentiment: 'pos', flags: [] });
  assert.equal(decideMood('improve', { label: 'pos', score: 0.99 }).sentiment, 'unsure');
  assert.equal(decideMood('unknown', { label: 'neg', score: 0.6 }).sentiment, 'unsure');
  assert.equal(decideMood('unknown', { label: 'neg', score: 0.97 }).sentiment, 'neg');
});

const guests = [
  { id: 'a', name: 'Marco', language: 'it', consent: true },
  { id: 'b', name: 'Li Na', language: 'zh', consent: false },
  { id: 'c', name: 'Emma', language: 'en', consent: true },
];
const S = (topic, sentiment, extra = {}) => ({ en: `${topic} ${sentiment}`, topic, sentiment, flags: [], confirmed: false, ...extra });
const entries = [
  { id: 'e1', guestId: 'a', lang: 'it', sentences: [S('coffee', 'pos'), S('access', 'neg')], products: ['coffee'] },
  { id: 'e2', guestId: 'b', lang: 'zh', sentences: [S('coffee', 'pos'), S('facilities', 'neg'), S('other', 'pos', { flags: ['topic-unsure'] })], products: ['coffee'] },
  { id: 'e3', guestId: 'c', lang: 'en', sentences: [S('food', 'pos'), S('facilities', 'unsure', { flags: ['low-confidence'] })], products: ['coffee'] },
];

test('summary counts guests per topic and needs-check items', () => {
  const s = summarize(entries, guests);
  assert.equal(s.guests, 3);
  assert.equal(s.liked[0].id, 'coffee');
  assert.equal(s.liked[0].guests, 2);
  assert.equal(s.improve.find(x => x.id === 'facilities').guests, 1);
  assert.equal(s.unsure, 2);
  assert.equal(s.products[0].guests, 3);
  assert.ok(strongProduct(s), '3 of 3 guests asked for coffee');
});

test('confirmed sentences no longer need a check', () => {
  assert.equal(needsCheck(S('other', 'pos', { flags: ['topic-unsure'] })), true);
  assert.equal(needsCheck(S('other', 'pos', { flags: [], confirmed: true })), false);
});

test('Swahili summary is template text with the few-data caution', () => {
  const t = summaryText(summarize(entries, guests));
  assert.ok(t.sw[0].startsWith('Kipindi hiki: wageni 3'));
  assert.ok(t.sw.some(p => p.startsWith('Tahadhari')));
  assert.ok(t.sw.some(p => p.startsWith('Wazo:')));
  assert.equal(t.sw.length, t.en.length);
});

test('voice clip ids exist for every possible summary', () => {
  const phrases = JSON.parse(readFileSync(new URL('../audio/phrases-sw.json', import.meta.url))).phrases;
  const s = summarize(entries, guests);
  for (const id of summaryClipIds(s)) assert.ok(phrases[id], `missing phrase ${id}`);
  for (const t of TOPICS) assert.ok(phrases[`t_${t.id}`], `missing topic ${t.id}`);
  for (let i = 1; i <= 20; i++) assert.ok(phrases[`g_${i}`]);
  assert.deepEqual(summaryClipIds({ guests: 0 }), ['no_feedback']);
});

test('thank-you messages: guest language + parallel Swahili, English fallback', () => {
  const m = thankYou(guests[0], guestTopLiked(entries, 'a'));
  assert.equal(m.lang, 'it');
  assert.ok(m.text.includes('preparare il caffè insieme'));
  assert.ok(m.sw.includes('kuandaa kahawa pamoja'));
  const j = thankYou({ name: 'Yuki', language: 'ja' }, null);
  assert.equal(j.lang, 'en');
  assert.equal(j.usedFallback, true);
  for (const code of ['sw', 'en', 'it', 'fr', 'de', 'zh', 'es', 'pl']) {
    for (const t of TOPICS) assert.ok(t.msg[code], `${t.id} has no ${code} phrase`);
  }
});

test('guide report has no names or contacts', () => {
  const r = guideReport(summarize(entries, guests), 'Mwezi huu / This month');
  for (const g of guests) assert.ok(!r.includes(g.name));
});

test('weekly SMS lists bookings in Swahili', () => {
  const sms = weeklySms([{ date: day(3), guests: 4, language: 'it', guide: 'Juma' }]);
  assert.ok(sms.includes('wageni 4 (Kiitaliano)'));
  assert.ok(sms.includes('mwongozaji Juma'));
});

test('chrF: identical = 100, unrelated is low', () => {
  assert.equal(corpusChrF(['the coffee was good'], ['the coffee was good']), 100);
  assert.ok(corpusChrF(['xyz qqq'], ['the coffee was good']) < 20);
});

test('topic scoring counts abstentions', () => {
  const r = scoreTopics([{ text: 'a', topic: 'food' }, { text: 'b', topic: 'other' }], [{ topic: 'food' }, { topic: 'other' }]);
  assert.equal(r.accuracy, 100);
  assert.equal(r.abstainOnOther, 100);
});

test('every language has the fields the app uses', () => {
  for (const [c, l] of Object.entries(LANGS)) {
    assert.ok(l.sw && l.en && l.native && l.tess && l.whisper, c);
  }
});

console.log(`\n${n} checks passed`);
