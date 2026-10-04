// Kitabu cha Wageni — main app: state, screens, actions.
// Every screen is Swahili first with English underneath (toggle with "EN").

import { db, uid } from './db.js';
import { LANGS, SHARED_MODELS, PACK_MB, packLangs, planPacks, langName, KEEP_TOP_N } from './langs.js';
import { TOPICS, OTHER, topicById, PRODUCTS } from './topics.js';
import { weeklySms, summaryText, thankYou, guideReport, daySw, dayEn, SUBJECTS } from './templates.js';
import { summarize, inPeriod, guestTopLiked, needsCheck } from './summary.js';
import * as ai from './ai.js';
import { analyze } from './pipeline.js';
import { h, L, Li, toast, showBusy, progress, hideBusy, speak, isoDate, dayStamp, addDays, daysFromToday, copyText } from './ui.js';
import { summaryClipIds, playClips, prefetchVoice, loadVoiceManifest } from './voice.js';

const view = document.getElementById('view');

const freshAdd = () => ({ step: 1, guestId: null, inputs: [], results: [] });

const state = {
  tab: 'week',
  guests: [],
  entries: [],
  bookings: [],
  messages: [],
  installed: [],
  shared: { voice: false, topics: false, mood: false },
  online: navigator.onLine,
  period: 'month',
  add: freshAdd(),
  recording: false,
  lastSync: null,
  shareOk: false,
  openGuest: null,
};

// ---------------------------------------------------------------- data
async function loadAll() {
  const [g, e, b, m] = await Promise.all(['guests', 'entries', 'bookings', 'messages'].map(s => db.all(s)));
  Object.assign(state, { guests: g, entries: e, bookings: b, messages: m });
  state.lastSync = await db.getSetting('lastSync');
  const showEn = await db.getSetting('showEn', true);
  document.body.classList.toggle('hide-en', !showEn);
}

async function refreshModels() {
  try {
    state.installed = await ai.installedPacks();
    for (const k of Object.keys(SHARED_MODELS)) state.shared[k] = await ai.isModelCached(SHARED_MODELS[k].id);
  } catch (err) {
    console.warn('model check failed', err);
  }
}

const guestById = id => state.guests.find(g => g.id === id);
const currentGuest = () => guestById(state.add.guestId);

function currentPlan() {
  return planPacks({ guests: state.guests, bookings: state.bookings, installed: state.installed, today: new Date() });
}

function currentSummary() {
  const entries = state.entries.filter(e => e.status !== 'pending' && inPeriod(e.visitDate || e.createdAt, state.period));
  const s = summarize(entries, state.guests);
  return { s, entries, text: summaryText(s) };
}

// ---------------------------------------------------------------- small render helpers
const langPill = code => `<span class="chip plain lang-pill" title="${h(langName(code, 'en'))}">${h(langName(code, 'sw'))}</span>`;

function moodChip(m) {
  if (m === 'pos') return `<span class="chip">${Li('Nzuri', 'positive')}</span>`;
  if (m === 'neg') return `<span class="chip neg">${Li('Ya kuboresha', 'to improve')}</span>`;
  return `<span class="chip warn">${Li('Haijulikani', 'unsure')}</span>`;
}

function consentChip(g) {
  return g.consent
    ? `<span class="chip">${Li('Ameruhusu mawasiliano', 'consented to contact')}</span>`
    : `<span class="chip plain">${Li('Hakuna ruhusa', 'no consent')}</span>`;
}

function packChip(code) {
  if (!LANGS[code]?.mt) return `<span class="chip plain">${Li('Haihitaji pakiti', 'no pack needed')}</span>`;
  return state.installed.includes(code)
    ? `<span class="chip">${Li('Lugha iko tayari', 'pack ready')}</span>`
    : `<span class="chip warn">${Li('Pakua lugha', 'pack needed')}</span>`;
}

const FLAG_TEXT = {
  'topic-unsure': ['Mada haijulikani', 'topic unclear'],
  'conflict': ['Inapingana na kisanduku alichoandika', 'contradicts the box it was written in'],
  'low-confidence': ['Hisia hazijulikani', 'mood unclear'],
  'no-model': ['Hakuna modeli ya hisia', 'no sentiment model'],
};

function langOptions(selected) {
  return Object.entries(LANGS)
    .map(([c, l]) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${h(l.sw)} · ${h(l.en)} (${h(l.native)})</option>`)
    .join('');
}

function topicOptions(selected) {
  return [...TOPICS, OTHER]
    .map(t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${h(t.sw)} · ${h(t.en)}</option>`)
    .join('');
}

// One analyzed sentence with its labels and the controls a person uses to correct it.
function sentenceRow(entry, idx, { open = false } = {}) {
  const s = entry.sentences[idx];
  const t = topicById(s.topic);
  const check = needsCheck(s);
  const flags = (s.flags || []).filter(f => FLAG_TEXT[f]);
  const showOrig = s.original && entry.lang !== 'en';
  return `
  <div class="sent">
    ${showOrig ? `<div class="orig" lang="${h(entry.lang)}">“${h(s.original)}”</div>` : ''}
    ${s.en ? `<div class="${showOrig ? 'small muted' : ''}">${showOrig ? 'EN: ' : ''}${h(s.en)}</div>` : ''}
    <div class="tags">
      <span class="chip ${s.topic === 'other' ? 'warn' : ''}">${h(t.sw.split(' (')[0])}<span class="en inline"> · ${h(t.en)}</span></span>
      ${moodChip(s.sentiment)}
      ${check ? `<span class="chip warn">${Li('Angalia', 'check')}</span>` : s.confirmed ? `<span class="chip plain">${Li('Imethibitishwa', 'confirmed')}</span>` : ''}
    </div>
    ${check && flags.length ? `<div class="small muted" style="margin-top:4px">${flags.map(f => `${FLAG_TEXT[f][0]} <span class="en inline">(${FLAG_TEXT[f][1]})</span>`).join('; ')}</div>` : ''}
    <details ${open || check ? 'open' : ''} style="margin-top:6px">
      <summary class="small" style="cursor:pointer;color:var(--primary);font-weight:600;min-height:32px">${Li('Rekebisha', 'correct')}</summary>
      <div class="stack" style="margin-top:6px">
        <label class="field small">${L('Mada', 'Topic')}
          <select data-change="fix-topic" data-entry="${entry.id}" data-idx="${idx}">${topicOptions(s.topic)}</select>
        </label>
        <div class="row">
          <button class="btn small secondary" data-action="fix-mood" data-entry="${entry.id}" data-idx="${idx}" data-mood="pos" aria-pressed="${s.sentiment === 'pos'}">${Li('Nzuri', 'positive')}</button>
          <button class="btn small secondary" data-action="fix-mood" data-entry="${entry.id}" data-idx="${idx}" data-mood="neg" aria-pressed="${s.sentiment === 'neg'}">${Li('Ya kuboresha', 'to improve')}</button>
          <button class="btn small" data-action="confirm-sent" data-entry="${entry.id}" data-idx="${idx}">${Li('Sawa', 'OK')}</button>
        </div>
      </div>
    </details>
  </div>`;
}

// Swahili entries are read by Noor directly; a person can tag the topic by hand.
function swahiliEntryBlock(entry) {
  const s = entry.sentences?.[0];
  return `
  <div class="sent">
    <div lang="sw">“${h(entry.original)}”</div>
    <div class="small muted">${Li('Kiswahili — Noor anasoma mwenyewe. Weka mada kwa mkono (hiari).', 'Swahili — Noor reads it herself. Tag a topic by hand (optional).')}</div>
    <div class="row" style="margin-top:6px">
      <select data-change="sw-topic" data-entry="${entry.id}" aria-label="Topic">
        <option value="">— ${h('Mada')} · topic —</option>${topicOptions(s?.topic)}
      </select>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="btn small secondary" data-action="sw-mood" data-entry="${entry.id}" data-mood="pos" aria-pressed="${s?.sentiment === 'pos'}">${Li('Nzuri', 'positive')}</button>
      <button class="btn small secondary" data-action="sw-mood" data-entry="${entry.id}" data-mood="neg" aria-pressed="${s?.sentiment === 'neg'}">${Li('Ya kuboresha', 'to improve')}</button>
    </div>
  </div>`;
}

function entryCard(entry) {
  const g = guestById(entry.guestId);
  const boxLabel = entry.box === 'liked' ? Li('Walipenda', 'liked box') : entry.box === 'improve' ? Li('Kuboresha', 'could-be-better box') : Li('Maoni', 'feedback');
  const srcLabel = entry.source === 'photo' ? Li('Picha', 'photo') : entry.source === 'voice' ? Li('Sauti', 'voice') : Li('Imeandikwa', 'typed');
  let body;
  if (entry.status === 'pending') {
    body = `<p class="muted">${Li('Bado haijachanganuliwa.', 'Not analysed yet.')}</p><p lang="${h(entry.lang)}">“${h(entry.original)}”</p>`;
  } else if (entry.status === 'swahili') {
    body = swahiliEntryBlock(entry);
  } else if (!entry.sentences?.length) {
    body = `<p lang="${h(entry.lang)}">“${h(entry.original)}”</p><p class="small muted">${Li('Hakuna sentensi za kuchanganua.', 'No sentences to analyse.')}</p>`;
  } else {
    body = entry.sentences.map((_, i) => sentenceRow(entry, i)).join('');
  }
  return `
  <div class="card flat">
    <div class="card-title">
      <div><strong>${h(g?.name || 'Mgeni')}</strong> ${langPill(entry.lang)}</div>
      <div class="small muted">${srcLabel} · ${boxLabel}</div>
    </div>
    ${entry.lowWords?.length ? `<div class="notice warn small">${Li('Maneno ambayo picha haikusomeka vizuri yalirekebishwa na msaidizi.', 'Words the photo reader was unsure of were checked by the helper.')}</div>` : ''}
    ${body}
    ${entry.synthetic ? `<div class="small muted" style="margin-top:6px">${Li('Mfano (data bandia)', 'Example (synthetic data)')}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- screen: next week
function screenWeek() {
  const upcoming = state.bookings
    .filter(b => daysFromToday(b.date) >= 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const next7 = upcoming.filter(b => daysFromToday(b.date) <= 7);
  const later = upcoming.filter(b => daysFromToday(b.date) > 7);
  const plan = currentPlan();
  const sms = weeklySms(next7);

  const bookingLi = b => `
    <li>
      <div class="row between">
        <strong>${h(daySw(b.date))} <span class="en inline">· ${h(dayEn(b.date))}</span></strong>
        <span class="badge-num" title="guests">${h(b.guests)}</span>
      </div>
      <div class="row small" style="margin-top:6px">
        ${langPill(b.language)} ${packChip(b.language)}
        ${b.guide ? `<span class="muted">${Li('Mwongozaji', 'guide')}: ${h(b.guide)}</span>` : ''}
      </div>
      <div class="small muted" style="margin-top:4px">${h(b.leadName || '')}${b.company ? ` · ${h(b.company)}` : ''}</div>
    </li>`;

  return `
  <h1>${L('Wiki ijayo', 'Next week')}</h1>

  <div class="card">
    <div class="card-title"><h2>${L('Ratiba kutoka kwa mwongozaji', 'Schedule from the tour company')}</h2></div>
    <p class="small muted">${Li('Msaidizi (k.m. binti yako wikendi) akiunganisha mtandao, ratiba mpya inapakuliwa na lugha zinazohitajika zinaandaliwa.', 'When the helper connects (e.g. the daughter at the weekend), the new schedule downloads and the needed languages are prepared.')}</p>
    <button class="btn block" data-action="sync" ${state.online ? '' : 'disabled'}>${L('Pokea ratiba mpya', 'Receive new schedule')}</button>
    <p class="small muted" style="margin-top:8px">${state.lastSync ? `${Li('Mara ya mwisho', 'last synced')}: ${h(new Date(state.lastSync).toLocaleString())}` : Li('Bado haijapokelewa', 'not synced yet')}${state.online ? '' : ` · ${Li('Nje ya mtandao', 'offline')}`}</p>
  </div>

  ${next7.length ? `
  <div class="card">
    <h2>${L('Siku 7 zijazo', 'Next 7 days')}</h2>
    <ul class="list">${next7.map(bookingLi).join('')}</ul>
  </div>` : `
  <div class="notice">${L('Hakuna wageni waliopangwa siku 7 zijazo.', 'No guests booked for the next 7 days.')}</div>`}

  <div class="card">
    <h2>${L('Ujumbe kwa simu ya Noor', 'SMS to Noor’s basic phone')}</h2>
    <p class="small muted">${Li('Huu ndio ujumbe ambao simu ya kawaida ya Noor ingepokea (mfano; toleo halisi litatuma kwa SMS).', 'This is the text Noor’s feature phone would receive (simulated; the real version sends it as an SMS).')}</p>
    <div class="sms" id="sms-text">${h(sms)}</div>
    <div class="row between" style="margin-top:8px">
      <span class="small muted">${sms.length} ${Li('herufi', 'characters')}</span>
      <button class="btn small secondary" data-action="copy" data-copy-from="sms-text">${Li('Nakili', 'Copy')}</button>
    </div>
  </div>

  <div class="card">
    <h2>${L('Lugha za kuandaa', 'Languages to prepare')}</h2>
    ${plan.download.length ? `
      <p>${Li('Pakua kabla wageni hawajafika', 'Download before the guests arrive')}:</p>
      <div class="row">${plan.download.map(c => langPill(c)).join('')}</div>
      <p class="small muted">${Li(`Takriban MB ${plan.downloadMB}. Tumia Wi-Fi au kifurushi cha data.`, `About ${plan.downloadMB} MB. Use Wi-Fi or a data bundle.`)}</p>
      <button class="btn block" data-action="download-suggested" ${state.online ? '' : 'disabled'}>${L('Pakua sasa', 'Download now')}</button>
    ` : `<p>${Li('Lugha zote zinazohitajika ziko tayari.', 'All needed languages are ready.')}</p>`}
    ${plan.removable.length ? `
      <hr>
      <p>${Li('Lugha nadra zinazoweza kufutwa ili kuokoa nafasi', 'Rare languages that can be deleted to save space')}:</p>
      <div class="row">${plan.removable.map(c => langPill(c)).join('')}</div>
      <button class="btn block danger" data-action="delete-removable" style="margin-top:8px">${L(`Futa (MB ${plan.freeMB})`, `Delete (${plan.freeMB} MB)`)}</button>
    ` : ''}
  </div>

  ${later.length ? `
  <div class="card">
    <h2>${L('Baadaye', 'Later')}</h2>
    <ul class="list">${later.map(bookingLi).join('')}</ul>
  </div>` : ''}

  <details class="card">
    <summary style="cursor:pointer;font-weight:650;min-height:32px">${Li('Kwa mwongozaji: ongeza mgeni', 'For the guide: add a booking')}</summary>
    <div class="stack" style="margin-top:12px">
      <label class="field">${L('Tarehe', 'Date')}<input type="date" id="bk-date" value="${isoDate(addDays(new Date(), 3))}"></label>
      <div class="grid2">
        <label class="field">${L('Idadi ya wageni', 'Number of guests')}<input type="number" id="bk-guests" min="1" value="2"></label>
        <label class="field">${L('Lugha', 'Language')}<select id="bk-lang">${langOptions('en')}</select></label>
      </div>
      <label class="field">${L('Jina la mgeni mkuu', 'Lead guest name')}<input type="text" id="bk-name" autocomplete="off"></label>
      <label class="field">${L('Mwongozaji', 'Guide')}<input type="text" id="bk-guide" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="bk-consent" data-change="bk-consent-toggle"> <span>${L('Mgeni amekubali Noor awasiliane naye', 'Guest agreed that Noor may contact them')}</span></label>
      <label class="field hidden" id="bk-email-wrap">${L('Barua pepe', 'Email')}<input type="email" id="bk-email" autocomplete="off"></label>
      <button class="btn" data-action="add-booking">${L('Hifadhi', 'Save')}</button>
    </div>
  </details>`;
}

// ---------------------------------------------------------------- screen: add feedback
function screenAdd() {
  const a = state.add;
  const steps = `<div class="steps" aria-hidden="true">${[1, 2, 3].map(n => `<span class="${a.step >= n ? 'on' : ''}"></span>`).join('')}</div>`;
  if (a.step === 1) return steps + addStep1();
  if (a.step === 2) return steps + addStep2();
  return steps + addStep3();
}

function addStep1() {
  const recentBookings = state.bookings
    .filter(b => { const d = daysFromToday(b.date); return d <= 1 && d >= -14; })
    .filter(b => !state.guests.some(g => g.bookingId === b.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const guests = state.guests.slice().sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate)).slice(0, 12);

  return `
  <h1>${L('Mgeni ni nani?', 'Who is the guest?')}</h1>

  ${recentBookings.length ? `
  <div class="card">
    <h2>${L('Kutoka kwenye ratiba', 'From the schedule')}</h2>
    <ul class="list">${recentBookings.map(b => `
      <li class="row between">
        <div><strong>${h(b.leadName || 'Mgeni')}</strong> ${langPill(b.language)}<div class="small muted">${h(daySw(b.date))} · ${Li('wageni', 'guests')} ${h(b.guests)}</div></div>
        <button class="btn small" data-action="pick-booking" data-id="${b.id}">${Li('Chagua', 'Pick')}</button>
      </li>`).join('')}
    </ul>
  </div>` : ''}

  ${guests.length ? `
  <div class="card">
    <h2>${L('Wageni waliopo', 'Existing guests')}</h2>
    <ul class="list">${guests.map(g => `
      <li class="row between">
        <div><strong>${h(g.name)}</strong> ${langPill(g.language)}<div class="small muted">${h(daySw(g.visitDate))}</div></div>
        <button class="btn small secondary" data-action="pick-guest" data-id="${g.id}">${Li('Chagua', 'Pick')}</button>
      </li>`).join('')}
    </ul>
  </div>` : ''}

  <div class="card">
    <h2>${L('Mgeni mpya', 'New guest')}</h2>
    <p class="small muted">${Li('Andika kutoka kwenye ukurasa wa kitabu cha wageni.', 'Copy from the guestbook page.')}</p>
    <div class="stack">
      <label class="field">${L('Jina', 'Name')}<input type="text" id="ng-name" autocomplete="off"></label>
      <label class="field">${L('Lugha ya mgeni', 'Guest’s language')}<select id="ng-lang">${langOptions('en')}</select></label>
      <label class="field">${L('Tarehe ya ziara', 'Visit date')}<input type="date" id="ng-date" value="${isoDate(new Date())}"></label>
      <label class="field">${L('Nani alikupendekezea? (hiari)', 'Who recommended us? (optional)')}<input type="text" id="ng-ref" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="ng-consent" data-change="consent-toggle">
        <span>${L('Mgeni aliweka alama: “Noor anaweza kuhifadhi mawasiliano yangu na kuniandikia”', 'Guest ticked: “Noor may keep my contact details and write to me”')}</span></label>
      <div id="contact-fields" class="stack hidden">
        <label class="field">${L('Barua pepe', 'Email')}<input type="email" id="ng-email" autocomplete="off"></label>
        <label class="field">${L('Simu / WhatsApp', 'Phone / WhatsApp')}<input type="tel" id="ng-phone" autocomplete="off"></label>
      </div>
      <p class="small muted">${Li('Bila alama hiyo, mawasiliano hayahifadhiwi.', 'Without that tick, no contact details are stored.')}</p>
      <button class="btn" data-action="save-new-guest">${L('Endelea', 'Continue')}</button>
    </div>
  </div>`;
}

const ICON_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const ICON_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';

function addStep2() {
  const g = currentGuest();
  if (!g) { state.add.step = 1; return addStep1(); }
  const needPack = LANGS[g.language]?.mt && !state.installed.includes(g.language);
  const ready = state.add.inputs.some(i => i.status === 'ready' && (i.text || '').trim());
  const working = state.add.inputs.some(i => i.status === 'working');

  const inputCard = i => {
    const boxSel = `
      <select data-change="box" data-id="${i.id}" aria-label="Box">
        <option value="liked" ${i.box === 'liked' ? 'selected' : ''}>Walipenda · liked</option>
        <option value="improve" ${i.box === 'improve' ? 'selected' : ''}>Kuboresha · could be better</option>
        <option value="unknown" ${i.box === 'unknown' ? 'selected' : ''}>Haijulikani · not sure</option>
      </select>`;
    const hint = i.langHint ? `
      <div class="notice warn small">${Li(`Inaonekana ni ${langName(i.langHint, 'sw')}, si ${langName(g.language, 'sw')}.`, `This looks like ${langName(i.langHint, 'en')}, not ${langName(g.language, 'en')}.`)}
        <div class="row" style="margin-top:6px"><button class="btn small secondary" data-action="use-hint" data-lang="${i.langHint}">${Li(`Badilisha lugha ya mgeni kuwa ${langName(i.langHint, 'sw')}`, `Switch guest language to ${langName(i.langHint, 'en')}`)}</button></div>
      </div>` : '';
    let media = '';
    if (i.imageURL) media = `<img class="preview-img" src="${i.imageURL}" alt="Photo of the guestbook box">`;
    if (i.audioURL) media = `<audio controls src="${i.audioURL}" style="width:100%"></audio>`;
    let body = '';
    if (i.status === 'working') body = `<p class="muted">${Li('Inasoma…', 'Reading…')}</p>`;
    else if (i.status === 'error') body = `<div class="notice neg small">${Li('Imeshindwa', 'Failed')}: ${h(i.error)}</div>`;
    else {
      body = `
        ${i.lowWords?.length ? `<div class="notice warn small"><strong>${Li('Angalia maneno haya', 'Check these words')}</strong>${i.lowWords.slice(0, 20).map(w => `<mark class="low">${h(w)}</mark>`).join(' ')}</div>` : ''}
        <label class="field small">${i.source === 'voice' ? L('Alichosema mgeni', 'What the guest said') : L('Maandishi (rekebisha makosa)', 'Text (fix any mistakes)')}
          <textarea data-input="input-text" data-id="${i.id}" lang="${h(g.language)}">${h(i.text)}</textarea></label>
        ${i.source === 'voice' && g.language !== 'en' && g.language !== 'sw' ? `
        <label class="field small">${L('Tafsiri ya Kiingereza (kutoka kwa modeli ya sauti)', 'English translation (from the voice model)')}
          <textarea data-input="input-english" data-id="${i.id}" style="min-height:80px">${h(i.english)}</textarea></label>` : ''}`;
    }
    const srcLabel = i.source === 'photo' ? L('Picha', 'Photo') : i.source === 'voice' ? L('Sauti', 'Voice') : L('Kuandika', 'Typed');
    return `
    <div class="card flat">
      <div class="card-title"><h3>${srcLabel}</h3><button class="btn small danger" data-action="remove-input" data-id="${i.id}">${Li('Ondoa', 'Remove')}</button></div>
      <div class="stack">
        ${media}
        <label class="field small">${L('Kisanduku', 'Which box')}${boxSel}</label>
        ${hint}
        ${body}
      </div>
    </div>`;
  };

  return `
  <div class="card">
    <div class="row between">
      <div><strong>${h(g.name)}</strong> ${langPill(g.language)}<div class="small muted">${h(daySw(g.visitDate))}</div></div>
      <button class="btn small secondary" data-action="change-guest">${Li('Badilisha', 'Change')}</button>
    </div>
    <div class="row" style="margin-top:8px">${consentChip(g)}</div>
  </div>

  ${needPack ? `<div class="notice warn">${Li(`Lugha ya ${langName(g.language, 'sw')} haijapakuliwa. Kusoma picha kunawezekana; kuchanganua kutahitaji mtandao mara moja (MB ${PACK_MB}).`, `The ${langName(g.language, 'en')} pack is not downloaded. Reading photos works; analysing will need internet once (${PACK_MB} MB).`)}</div>` : ''}

  <h2 class="section-head">${L('Ongeza maoni', 'Add feedback')}</h2>
  <div class="grid2">
    <label class="btn big">${ICON_CAMERA}<span class="btn-col">${L('Picha A: Walipenda', 'Photo of box A: liked')}</span>
      <input type="file" accept="image/*" capture="environment" data-file="photo-liked" class="hidden"></label>
    <label class="btn big">${ICON_CAMERA}<span class="btn-col">${L('Picha B: Kuboresha', 'Photo of box B: could be better')}</span>
      <input type="file" accept="image/*" capture="environment" data-file="photo-improve" class="hidden"></label>
    <button class="btn big ${state.recording ? 'danger' : 'secondary'}" data-action="record">
      ${state.recording ? '<span class="rec-dot"></span>' : ICON_MIC}<span class="btn-col">${state.recording ? L('Simamisha', 'Stop recording') : L('Rekodi sauti', 'Record voice')}</span></button>
    <button class="btn big secondary" data-action="add-typed">${ICON_PEN}<span class="btn-col">${L('Andika', 'Type')}</span></button>
  </div>
  <label class="small" style="display:block;margin:10px 2px 0;color:var(--primary);font-weight:600;cursor:pointer">
    ${Li('Au pakia faili la sauti', 'Or upload an audio file')}
    <input type="file" accept="audio/*" data-file="audio" class="hidden"></label>

  <div class="stack" style="margin-top:14px">${state.add.inputs.map(inputCard).join('')}</div>

  <button class="btn block" style="margin-top:8px" data-action="run-analysis" ${ready && !working ? '' : 'disabled'}>${L('Changanua', 'Analyse')}</button>
  <p class="small muted" style="margin-top:8px">${Li('Kila kitu kinabaki kwenye simu hii.', 'Everything stays on this phone.')}</p>`;
}

function addStep3() {
  const entries = state.add.results.map(id => state.entries.find(e => e.id === id)).filter(Boolean);
  const g = currentGuest();
  const unsure = entries.reduce((n, e) => n + (e.sentences || []).filter(needsCheck).length, 0);
  return `
  <h1>${L('Matokeo', 'Results')}</h1>
  ${unsure ? `<div class="notice warn"><strong>${Li(`Sentensi ${unsure} zinahitaji kuangaliwa`, `${unsure} sentences need a check`)}</strong>${Li('AI haikuwa na uhakika. Rekebisha au bonyeza “Sawa”.', 'The AI was not sure. Correct them or press “OK”.')}</div>`
    : `<div class="notice">${Li('Imehifadhiwa. Unaweza kurekebisha chochote hapa chini.', 'Saved. You can correct anything below.')}</div>`}
  ${entries.map(entryCard).join('')}
  <div class="stack">
    <button class="btn" data-action="more-feedback">${L(`Ongeza maoni mengine ya ${h(g?.name || 'mgeni')}`, 'Add more for this guest')}</button>
    <button class="btn secondary" data-action="finish-add">${L('Maliza na uone muhtasari', 'Finish and see the summary')}</button>
  </div>`;
}

// ---------------------------------------------------------------- screen: summary
const PERIODS = { week: ['Wiki hii', 'This week'], month: ['Mwezi huu', 'This month'], all: ['Zote', 'All time'] };

function screenSummary() {
  const pending = state.entries.filter(e => e.status === 'pending');
  const { s, entries, text } = currentSummary();
  const periodChips = Object.entries(PERIODS).map(([k, [sw, en]]) =>
    `<button class="chip" data-action="period" data-period="${k}" aria-pressed="${state.period === k}">${sw}<span class="en inline"> · ${en}</span></button>`).join('');

  const topicList = (items, neg) => items.filter(x => x.id !== 'other').map(x => {
    const t = topicById(x.id);
    const pct = s.guests ? Math.round((x.guests / s.guests) * 100) : 0;
    const quotes = x.quotes.slice(0, 5).map(q => `
      <blockquote class="q">${q.original && q.lang !== 'en' ? `<div class="orig" lang="${h(q.lang)}">“${h(q.original)}”</div><div class="trans">EN: ${h(q.en)}</div>` : `<div class="orig">“${h(q.en)}”</div>`}
      ${q.flagged ? `<span class="chip warn" style="margin-top:4px">${Li('Angalia', 'check')}</span>` : ''}</blockquote>`).join('');
    return `
      <div class="topic-row" style="display:block">
        <div class="row between"><div><strong>${h(t.sw)}</strong><span class="en">${h(t.en)}</span></div><span class="badge-num ${neg ? 'neg' : ''}">${x.guests}</span></div>
        <div class="bar ${neg ? 'neg' : ''}"><span style="width:${pct}%"></span></div>
        <details class="quotes"><summary>${Li('Maneno ya wageni', 'What guests said')} (${x.quotes.length})</summary>${quotes}</details>
      </div>`;
  }).join('');

  const flagged = [];
  for (const e of entries) (e.sentences || []).forEach((sen, i) => { if (needsCheck(sen)) flagged.push([e, i]); });

  const report = guideReport(s, `${PERIODS[state.period][0]} / ${PERIODS[state.period][1]}`);

  return `
  <h1>${L('Muhtasari', 'Summary')}</h1>
  <div class="row" style="margin-bottom:12px">${periodChips}</div>

  ${pending.length ? `
  <div class="notice warn">
    <strong>${Li(`Maoni ${pending.length} bado hayajachanganuliwa`, `${pending.length} entries not analysed yet`)}</strong>
    <button class="btn block" style="margin-top:8px" data-action="analyze-pending">${L('Changanua sasa', 'Analyse now')}</button>
  </div>` : ''}

  ${s.entries === 0 ? (pending.length ? '' : `
  <div class="card">
    <p>${Li('Bado hakuna maoni kwa kipindi hiki.', 'No feedback for this period yet.')}</p>
    <div class="stack">
      <button class="btn" data-action="go" data-tab="add">${L('Ongeza maoni', 'Add feedback')}</button>
      <button class="btn secondary" data-action="load-demo">${L('Pakia mfano (data bandia)', 'Load example (synthetic data)')}</button>
    </div>
  </div>`) : `
  <div class="card">
    <div class="card-title"><h2>${L('Kwa Noor', 'For Noor')}</h2>
      <button class="btn small secondary" data-action="speak" aria-label="Read aloud">${Li('Sikiliza', 'Listen')}</button></div>
    <div class="big-summary" lang="sw">${text.sw.map(p => `<p>${h(p)}</p>`).join('')}</div>
    <div class="en small" style="margin-top:6px">${text.en.map(p => `<p>${h(p)}</p>`).join('')}</div>
    <p class="small muted">${Li('Sentensi hizi zimeandikwa na watu mapema; AI imejaza tu idadi na majina ya mada. Uamuzi ni wa Noor.', 'These sentences are human-written templates; the AI only fills in counts and topic names. Noor decides.')}</p>
  </div>

  ${s.liked.filter(x => x.id !== 'other').length ? `<div class="card"><h2>${L('Walichopenda', 'What they liked')}</h2>${topicList(s.liked, false)}</div>` : ''}
  ${s.improve.filter(x => x.id !== 'other').length ? `<div class="card"><h2>${L('Wanachotaka kiboreshwe', 'What they want improved')}</h2>${topicList(s.improve, true)}</div>` : ''}

  ${s.products.length ? `
  <div class="card">
    <h2>${L('Bidhaa walizotaka kununua', 'Products they wanted to buy')}</h2>
    ${s.products.map(p => { const P = PRODUCTS.find(x => x.id === p.id); return `<div class="topic-row"><div><strong>${h(P.sw)}</strong><span class="en">${h(P.en)}</span></div><span class="badge-num">${p.guests}</span></div>`; }).join('')}
    <p class="small muted">${Li('Imepatikana kwa maneno maalum (si makisio).', 'Found by fixed keywords, not guessed.')}</p>
  </div>` : ''}

  ${flagged.length ? `
  <div class="card">
    <h2>${L('Zinahitaji kuangaliwa', 'Needs a human check')}</h2>
    <p class="small muted">${Li('AI haikuwa na uhakika. Angalia pamoja na msaidizi au mwongozaji.', 'The AI was not sure. Check with the helper or the guide.')}</p>
    ${flagged.map(([e, i]) => `<div class="small muted" style="margin-top:8px">${h(guestById(e.guestId)?.name || '')} · ${h(langName(e.lang, 'sw'))}</div>${sentenceRow(e, i, { open: true })}`).join('')}
  </div>` : ''}

  <div class="card">
    <h2>${L('Ripoti kwa mwongozaji / kituo cha utalii', 'Report for the guide / tourism centre')}</h2>
    <p class="small muted">${Li('Hakuna majina, namba wala maneno ya wageni. Inatumwa tu Noor akikubali.', 'No names, contacts or quotes. Shared only if Noor agrees.')}</p>
    <div class="sms" id="report-text">${h(report)}</div>
    <label class="check" style="margin-top:10px"><input type="checkbox" data-change="share-ok" ${state.shareOk ? 'checked' : ''}>
      <span>${L('Nimesoma ripoti hii na nakubali ishirikiwe', 'I have read this report and agree to share it')}</span></label>
    <button class="btn block" id="share-btn" style="margin-top:10px" data-action="share" ${state.shareOk ? '' : 'disabled'}>${L('Shiriki', 'Share')}</button>
  </div>`}
  `;
}

// ---------------------------------------------------------------- screen: guests
function screenGuests() {
  const guests = state.guests.slice().sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
  if (!guests.length) {
    return `<h1>${L('Wageni', 'Guests')}</h1>
      <div class="card"><p>${Li('Bado hakuna wageni.', 'No guests yet.')}</p>
      <button class="btn" data-action="go" data-tab="add">${L('Ongeza maoni', 'Add feedback')}</button></div>`;
  }
  return `
  <h1>${L('Wageni', 'Guests')}</h1>
  <p class="small muted">${Li('Ujumbe wa shukrani umeandikwa na watu katika kila lugha. AI inachagua tu jambo alilopenda mgeni. Noor anaidhinisha kabla ya kutuma.', 'Thank-you messages are human-written in each language. The AI only picks what the guest liked. Noor approves before anything is sent.')}</p>
  <div class="card"><ul class="list">${guests.map(g => {
    const n = state.entries.filter(e => e.guestId === g.id).length;
    const sent = state.messages.some(m => m.guestId === g.id && m.status === 'sent');
    const open = state.openGuest === g.id;
    return `
      <li>
        <div class="row between">
          <div><strong>${h(g.name)}</strong> ${langPill(g.language)}${g.synthetic ? ` <span class="chip plain">${Li('mfano', 'example')}</span>` : ''}</div>
          <span class="small muted">${h(daySw(g.visitDate))}</span>
        </div>
        <div class="row small" style="margin-top:6px">${consentChip(g)} <span class="muted">${Li('maoni', 'entries')}: ${n}</span>
          ${sent ? `<span class="chip">${Li('Shukrani imetumwa', 'thanks sent')}</span>` : ''}</div>
        ${g.referredBy ? `<div class="small muted" style="margin-top:4px">${Li('Alipendekezwa na', 'recommended by')}: ${h(g.referredBy)}</div>` : ''}
        <div class="row" style="margin-top:8px">
          <button class="btn small ${open ? '' : 'secondary'}" data-action="toggle-draft" data-id="${g.id}">${Li('Ujumbe wa shukrani', 'Thank-you message')}</button>
          <button class="btn small danger" data-action="delete-guest" data-id="${g.id}">${Li('Futa', 'Delete')}</button>
        </div>
        ${open ? draftCard(g) : ''}
      </li>`;
  }).join('')}</ul></div>`;
}

function draftCard(g) {
  const liked = guestTopLiked(state.entries, g.id);
  const m = thankYou(g, liked);
  const c = g.contact || {};
  const subject = SUBJECTS[m.lang] || SUBJECTS.en;
  let send;
  if (!g.consent) {
    send = `<div class="notice warn small">${Li('Mgeni hakutoa ruhusa ya kuwasiliana — usitume ujumbe.', 'The guest did not consent to contact — do not send.')}</div>`;
  } else if (c.email) {
    send = `<a class="btn block" data-action="mark-sent" data-id="${g.id}" data-lang="${m.lang}" href="mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(m.text)}">${L('Idhinisha na tuma (barua pepe)', 'Approve and send (email)')}</a>`;
  } else if (c.phone) {
    send = `<a class="btn block" data-action="mark-sent" data-id="${g.id}" data-lang="${m.lang}" href="sms:${encodeURIComponent(c.phone)}?body=${encodeURIComponent(m.text)}">${L('Idhinisha na tuma (SMS)', 'Approve and send (SMS)')}</a>`;
  } else {
    send = `<div class="notice small">${Li('Hakuna barua pepe wala namba ya simu.', 'No email or phone number.')}</div>`;
  }
  return `
  <div class="stack" style="margin-top:12px">
    ${m.usedFallback ? `<div class="notice warn small">${Li(`Hakuna kiolezo cha ${langName(g.language, 'sw')} bado — tumetumia Kiingereza.`, `No ${langName(g.language, 'en')} template yet — using English.`)}</div>` : ''}
    <div class="card flat" lang="${m.lang}"><div class="small muted">${Li(`Kwa ${langName(m.lang, 'sw')}`, `In ${langName(m.lang, 'en')}`)}</div><p id="draft-${g.id}" style="margin:6px 0 0">${h(m.text)}</p></div>
    <div class="card flat" lang="sw"><div class="small muted">${Li('Maana yake kwa Kiswahili', 'What it says, in Swahili')}</div><p style="margin:6px 0 0">${h(m.sw)}</p></div>
    <p class="small muted">${liked ? Li(`Mada aliyopenda: ${topicById(liked).sw}`, `Liked topic: ${topicById(liked).en}`) : Li('Hakuna mada iliyo wazi — ujumbe wa jumla.', 'No clear liked topic — general message.')}</p>
    ${send}
    <button class="btn small secondary" data-action="copy" data-copy-from="draft-${g.id}">${Li('Nakili', 'Copy')}</button>
  </div>`;
}

// ---------------------------------------------------------------- screen: languages
function screenLangs() {
  const plan = currentPlan();
  const packRow = code => {
    const l = LANGS[code];
    const inst = state.installed.includes(code);
    const tags = [];
    if (plan.keep.includes(code)) tags.push(`<span class="chip">${Li('Inakaa daima', 'kept')}</span>`);
    if (plan.needed.includes(code)) tags.push(`<span class="chip warn">${Li('Wiki ijayo', 'needed next week')}</span>`);
    if (inst && plan.removable.includes(code)) tags.push(`<span class="chip plain">${Li('Nadra', 'rare')}</span>`);
    return `
      <div class="pack">
        <div><strong>${h(l.sw)}</strong> <span class="muted small">${h(l.native)}</span><span class="en">${h(l.en)} · ${inst ? 'downloaded' : 'not downloaded'} · ~${PACK_MB} MB</span>
          <div class="row" style="margin-top:4px">${inst ? `<span class="chip">${Li('Imepakuliwa', 'on phone')}</span>` : ''}${tags.join('')}</div></div>
        ${inst
          ? `<button class="btn small danger" data-action="delete-pack" data-lang="${code}">${Li('Futa', 'Delete')}</button>`
          : `<button class="btn small" data-action="download-pack" data-lang="${code}" ${state.online ? '' : 'disabled'}>${Li('Pakua', 'Get')}</button>`}
      </div>`;
  };
  const sharedRow = key => {
    const m = SHARED_MODELS[key];
    const inst = state.shared[key];
    return `
      <div class="pack">
        <div><strong>${h(m.sw)}</strong><span class="en">${h(m.en)} · ${h(m.id)} · ~${m.mb} MB</span></div>
        ${inst ? `<span class="chip">${Li('Tayari', 'ready')}</span>` : `<button class="btn small" data-action="download-shared" data-key="${key}" ${state.online ? '' : 'disabled'}>${Li('Pakua', 'Get')}</button>`}
      </div>`;
  };

  return `
  <h1>${L('Lugha', 'Languages')}</h1>
  <div class="notice">
    <strong>${Li(`Lugha ${KEEP_TOP_N + 2} muhimu`, `${KEEP_TOP_N + 2} essential languages`)}</strong>
    ${Li('Kiswahili na Kiingereza daima, pamoja na lugha 3 za wageni wengi. Lugha nyingine zinapakuliwa kabla mgeni hajafika na zinaweza kufutwa baadaye.', 'Swahili and English always, plus the 3 most common guest languages. Others are downloaded before a guest arrives and can be deleted afterwards.')}
  </div>
  <p class="small muted" id="storage-line"></p>

  <div class="card">
    <h2>${L('Lugha kuu', 'Core languages')}</h2>
    <div class="pack"><div><strong>Kiswahili</strong><span class="en">Swahili · Noor’s language: all screens, summaries and messages are human-written templates, no download</span></div><span class="chip">${Li('Ndani', 'built in')}</span></div>
    <div class="pack"><div><strong>Kiingereza</strong><span class="en">English · the pivot language the classifier works in, no download</span></div><span class="chip">${Li('Ndani', 'built in')}</span></div>
  </div>

  <div class="card">
    <h2>${L('Modeli za pamoja', 'Shared models')}</h2>
    <p class="small muted">${Li('Zinapakuliwa mara moja, zinafanya kazi kwa lugha zote, bila mtandao.', 'Downloaded once, used for every language, work offline.')}</p>
    ${Object.keys(SHARED_MODELS).map(sharedRow).join('')}
  </div>

  <div class="card">
    <h2>${L('Lugha za wageni', 'Guest language packs')}</h2>
    <p class="small muted">${plan.usedDefaults
      ? Li('Bado hakuna historia ya kutosha: tunatumia nchi zinazoleta wageni wengi Tanzania (NBS 2024): Italia, Ufaransa, Ujerumani.', 'Not enough history yet: using Tanzania’s top non-African, non-English source markets (NBS 2024): Italy, France, Germany.')
      : Li('Lugha zinazokaa zimechaguliwa kutoka historia ya wageni wa Noor.', 'Kept languages are chosen from Noor’s own guest history.')}</p>
    ${plan.recommend.length ? `
      <div class="notice small" style="margin-top:4px">${Li(`Inapendekezwa kupakua ukiwa na Wi-Fi: ${plan.recommend.map(c => LANGS[c].sw).join(', ')} (MB ${plan.recommendMB}).`, `Recommended when on Wi-Fi: ${plan.recommend.map(c => LANGS[c].en).join(', ')} (${plan.recommendMB} MB).`)}
        <button class="btn small block" style="margin-top:8px" data-action="download-recommended" ${state.online ? '' : 'disabled'}>${Li('Pakua zinazopendekezwa', 'Download recommended')}</button>
      </div>` : ''}
    ${packLangs().map(packRow).join('')}
    <p class="small muted" style="margin-top:12px">${Li(`Kila pakiti ni takriban MB ${PACK_MB} (modeli ya tafsiri iliyobanwa + data ya kusoma maandishi). Toleo la Android litatumia ML Kit (karibu MB 30 kwa lugha).`, `Each pack is about ${PACK_MB} MB (quantized translation model + text-reading data). An Android version would use ML Kit (about 30 MB per language).`)}</p>
  </div>`;
}

// ---------------------------------------------------------------- screen: more
function screenMore() {
  const demo = state.guests.some(g => g.synthetic);
  return `
  <h1>${L('Zaidi', 'More')}</h1>

  <div class="card">
    <h2>${L('Kurasa za kuchapisha', 'Printable pages')}</h2>
    <div class="stack">
      <a class="btn secondary" href="print/guestbook.html" target="_blank" rel="noopener">${L('Ukurasa wa kitabu cha wageni', 'Guestbook page')}</a>
      <a class="btn secondary" href="print/sales-log.html" target="_blank" rel="noopener">${L('Daftari la mauzo', 'Sales log page')}</a>
      <p class="small muted" style="margin:0">${Li('Kusoma daftari la mauzo kwa picha ni hatua inayofuata.', 'Reading the sales log from a photo is the next step.')}</p>
    </div>
  </div>

  <div class="card">
    <h2>${L('Data ya mfano', 'Example data')}</h2>
    <p class="small muted">${Li('Wageni 6 wa kubuni na maoni kwa Kiitaliano, Kifaransa, Kichina, Kiingereza na Kiswahili. Ni data bandia, imeandikwa na timu.', '6 invented guests with feedback in Italian, French, Chinese, English and Swahili. Synthetic, written by the team.')}</p>
    ${demo
      ? `<button class="btn danger" data-action="remove-demo">${L('Ondoa data ya mfano', 'Remove example data')}</button>`
      : `<button class="btn secondary" data-action="load-demo">${L('Pakia data ya mfano', 'Load example data')}</button>`}
  </div>

  <div class="card">
    <h2>${L('Faragha', 'Privacy')}</h2>
    <ul class="small" style="padding-left:18px;margin:0">
      <li>${Li('Data yote iko kwenye simu hii tu (hakuna seva).', 'All data stays on this phone (no server).')}</li>
      <li>${Li('Mawasiliano ya mgeni yanahifadhiwa tu akiweka alama ya ruhusa.', 'Guest contact details are stored only with the consent tick.')}</li>
      <li>${Li('Ripoti ya mwongozaji haina majina, namba wala maneno ya wageni.', 'The guide report has no names, contacts or quotes.')}</li>
      <li>${Li('Simu ikipotea: weka nenosiri kwenye simu; data inaweza kufutwa hapa.', 'If the phone is lost: use a phone lock; data can be wiped here.')}</li>
    </ul>
    <button class="btn danger block" style="margin-top:12px" data-action="wipe">${L('Futa data zote', 'Delete all data')}</button>
  </div>

  <div class="card">
    <h2>${L('Kuhusu', 'About')}</h2>
    <p class="small">${Li('Imejengwa kwa Hack-Nation × World Bank Small AI for Development (utalii).', 'Built for the Hack-Nation × World Bank Small AI for Development hackathon (tourism track).')}</p>
    <div class="stack">
      <a class="btn secondary" href="eval.html">${L('Jaribio la usahihi', 'Accuracy check')}</a>
      <a class="btn secondary" href="https://github.com/Tristazxy/noortourism#readme" target="_blank" rel="noopener">${L('Vyanzo vya data na mipaka', 'Data sources and limits')}</a>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- render
const SCREENS = { week: screenWeek, add: screenAdd, summary: screenSummary, guests: screenGuests, langs: screenLangs, more: screenMore };

function render() {
  view.innerHTML = SCREENS[state.tab]();
  document.querySelectorAll('.tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  document.getElementById('net').innerHTML = state.online ? Li('Mtandaoni', 'online') : Li('Nje ya mtandao', 'offline');
  if (state.tab === 'langs') {
    ai.storageEstimate().then(est => {
      const el = document.getElementById('storage-line');
      if (el && est) el.innerHTML = Li(`Nafasi iliyotumika: MB ${est.usedMB} kati ya MB ${est.quotaMB}`, `Storage used: ${est.usedMB} MB of ${est.quotaMB} MB`);
    });
  }
}

// ---------------------------------------------------------------- model downloads (always confirmed: data costs money)
async function confirmDownload(needs) {
  if (!needs.length) return true;
  const mb = needs.reduce((a, [kind, key]) => a + (kind === 'pack' ? PACK_MB : SHARED_MODELS[key].mb), 0);
  if (!navigator.onLine) {
    toast('Hakuna mtandao. Pakua lugha wikendi msaidizi akiwa na mtandao. · Offline: download packs when connected.', 6000);
    return false;
  }
  const names = needs.map(([kind, key]) => (kind === 'pack' ? LANGS[key].en : SHARED_MODELS[key].en)).join(', ');
  if (!confirm(`Pakua mara moja: takriban MB ${mb} (${names}). Endelea?\n\nOne-time download of about ${mb} MB (${names}). Continue?`)) return false;
  for (const [kind, key] of needs) {
    showBusy(kind === 'pack' ? `Inapakua ${LANGS[key].sw} · ${LANGS[key].en} pack` : `Inapakua · ${SHARED_MODELS[key].en}`);
    if (kind === 'pack') await ai.downloadPack(key, progress);
    else await ai.downloadShared(key, progress);
  }
  hideBusy();
  await refreshModels();
  return true;
}

async function downloadPacks(codes) {
  const needs = codes.filter(c => LANGS[c]?.mt && !state.installed.includes(c)).map(c => ['pack', c]);
  if (await confirmDownload(needs)) { toast('Lugha ziko tayari · Packs ready'); render(); }
}

async function deletePacks(codes) {
  if (!codes.length) return;
  const names = codes.map(c => LANGS[c].sw).join(', ');
  if (!confirm(`Futa ${names}? Zinaweza kupakuliwa tena baadaye.\n\nDelete ${codes.map(c => LANGS[c].en).join(', ')}? They can be downloaded again later.`)) return;
  for (const c of codes) await ai.deleteModel(LANGS[c].mt);
  await refreshModels();
  toast('Imefutwa · Deleted');
  render();
}

// ---------------------------------------------------------------- actions
async function syncBookings() {
  if (!navigator.onLine) return toast('Hakuna mtandao · Offline');
  showBusy('Inapokea ratiba · Receiving schedule');
  const res = await fetch('data/bookings.json', { cache: 'no-store' });
  const feed = await res.json();
  const today = new Date();
  const rows = feed.bookings.map(b => ({
    id: b.id, date: dayStamp(addDays(today, b.dayOffset)), guests: b.guests, leadName: b.leadName,
    language: b.language, guide: b.guide, company: feed.company, consent: !!b.consent,
    email: b.consent ? (b.email || '') : '', synthetic: true,
  }));
  await db.putMany('bookings', rows);
  state.bookings = await db.all('bookings');
  state.lastSync = new Date().toISOString();
  await db.setSetting('lastSync', state.lastSync);
  hideBusy();
  const plan = currentPlan();
  toast(plan.download.length
    ? `Ratiba imepokelewa. Pakua: ${plan.download.map(c => LANGS[c].sw).join(', ')} · Schedule received.`
    : 'Ratiba imepokelewa · Schedule received');
  render();
}

async function addBooking() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const date = v('bk-date');
  if (!date) return toast('Weka tarehe · Add a date');
  const consent = document.getElementById('bk-consent').checked;
  const row = {
    id: uid('bk'), date: dayStamp(date), guests: Math.max(1, Number(v('bk-guests')) || 1), leadName: v('bk-name') || 'Mgeni',
    language: v('bk-lang') || 'en', guide: v('bk-guide'), company: '', consent, email: consent ? v('bk-email') : '',
  };
  await db.put('bookings', row);
  state.bookings.push(row);
  toast('Imehifadhiwa · Saved');
  render();
}

async function pickBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  let g = state.guests.find(x => x.bookingId === b.id);
  if (!g) {
    g = {
      id: uid('g'), name: b.leadName || 'Mgeni', language: b.language, visitDate: b.date, consent: !!b.consent,
      contact: b.consent ? { email: b.email || '', phone: '' } : null, bookingId: b.id, groupSize: b.guests,
      createdAt: new Date().toISOString(), synthetic: !!b.synthetic,
    };
    await db.put('guests', g);
    state.guests.push(g);
  }
  state.add = freshAdd();
  state.add.guestId = g.id;
  state.add.step = 2;
  render();
}

async function saveNewGuest() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const consent = document.getElementById('ng-consent').checked;
  const g = {
    id: uid('g'), name: v('ng-name') || 'Mgeni', language: v('ng-lang') || 'en',
    visitDate: dayStamp(v('ng-date') || new Date()), consent,
    contact: consent ? { email: v('ng-email'), phone: v('ng-phone') } : null, // no consent -> nothing stored
    referredBy: v('ng-ref'), createdAt: new Date().toISOString(),
  };
  await db.put('guests', g);
  state.guests.push(g);
  state.add = freshAdd();
  state.add.guestId = g.id;
  state.add.step = 2;
  render();
}

async function addPhoto(file, box) {
  const g = currentGuest();
  const item = { id: uid('in'), source: 'photo', box, text: '', status: 'working', imageURL: URL.createObjectURL(file), lowWords: [] };
  state.add.inputs.push(item);
  render();
  try {
    showBusy('Inasoma picha · Reading the photo');
    const r = await ai.ocr(file, g.language, progress);
    Object.assign(item, { text: r.text, lowWords: r.lowWords, confidence: r.confidence, status: 'ready' });
    if (!r.text) { item.status = 'error'; item.error = 'Hakuna maandishi yaliyopatikana · No text found. Try a closer, brighter photo.'; }
    const hint = await ai.guessLanguage(r.text);
    if (hint && hint !== g.language) item.langHint = hint;
  } catch (err) {
    item.status = 'error';
    item.error = err.message;
  } finally {
    hideBusy();
    render();
  }
}

async function addAudio(blob) {
  const g = currentGuest();
  if (!state.shared.voice && !(await confirmDownload([['shared', 'voice']]))) return;
  const item = { id: uid('in'), source: 'voice', box: 'unknown', text: '', english: '', status: 'working', audioURL: URL.createObjectURL(blob) };
  state.add.inputs.push(item);
  render();
  try {
    showBusy('Inasikiliza · Listening');
    const r = await ai.transcribe(blob, g.language, progress);
    Object.assign(item, { text: r.original, english: r.english, status: 'ready' });
    state.shared.voice = true;
  } catch (err) {
    item.status = 'error';
    item.error = err.message;
  } finally {
    hideBusy();
    render();
  }
}

let recorder = null;
async function toggleRecording() {
  if (recorder) { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast('Simu hii haiwezi kurekodi hapa. Pakia faili la sauti. · Recording not supported; upload an audio file.', 5000);
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  const mr = new MediaRecorder(stream);
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    recorder = null;
    state.recording = false;
    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
    render();
    addAudio(blob).catch(err => toast(err.message));
  };
  mr.start();
  recorder = mr;
  state.recording = true;
  render();
}

async function runAnalysis() {
  const g = currentGuest();
  const inputs = state.add.inputs.filter(i => i.status === 'ready' && (i.text || '').trim());
  if (!inputs.length) return;
  const needs = [];
  if (g.language !== 'sw') {
    if (!state.shared.topics) needs.push(['shared', 'topics']);
    if (!state.shared.mood) needs.push(['shared', 'mood']);
    const needsTranslation = inputs.some(i => !(i.source === 'voice' && i.english));
    if (LANGS[g.language]?.mt && needsTranslation && !state.installed.includes(g.language)) needs.push(['pack', g.language]);
  }
  if (!(await confirmDownload(needs))) return;

  const saved = [];
  for (const [n, i] of inputs.entries()) {
    showBusy(`Inachanganua ${n + 1}/${inputs.length} · Analysing`);
    const english = i.source === 'voice' && g.language !== 'en' && g.language !== 'sw' ? i.english : undefined;
    const res = await analyze({ original: i.text.trim(), lang: g.language, box: i.box, english }, progress);
    const entry = {
      id: uid('fb'), guestId: g.id, lang: g.language, source: i.source, box: i.box, original: i.text.trim(),
      ...res, lowWords: i.lowWords || [], ocrConfidence: i.confidence ?? null,
      visitDate: g.visitDate, createdAt: new Date().toISOString(),
    };
    await db.put('entries', entry);
    state.entries.push(entry);
    saved.push(entry.id);
  }
  hideBusy();
  for (const i of state.add.inputs) { if (i.imageURL) URL.revokeObjectURL(i.imageURL); if (i.audioURL) URL.revokeObjectURL(i.audioURL); }
  state.add.inputs = [];
  state.add.results = saved;
  state.add.step = 3;
  await refreshModels();
  render();
}

async function analyzePending() {
  const pending = state.entries.filter(e => e.status === 'pending');
  const langs = [...new Set(pending.map(e => e.lang))];
  const needs = [];
  if (langs.some(l => l !== 'sw')) {
    if (!state.shared.topics) needs.push(['shared', 'topics']);
    if (!state.shared.mood) needs.push(['shared', 'mood']);
  }
  for (const l of langs) if (LANGS[l]?.mt && !state.installed.includes(l)) needs.push(['pack', l]);
  if (!(await confirmDownload(needs))) return;
  for (const [n, e] of pending.entries()) {
    showBusy(`Inachanganua ${n + 1}/${pending.length} · Analysing`);
    const res = await analyze({ original: e.original, lang: e.lang, box: e.box }, progress);
    Object.assign(e, res);
    await db.put('entries', e);
  }
  hideBusy();
  await refreshModels();
  toast('Imekamilika · Done');
  render();
}

async function saveEntry(entry) {
  await db.put('entries', entry);
  render();
}

function findSentence(el) {
  const entry = state.entries.find(e => e.id === el.dataset.entry);
  if (!entry) return [null, null];
  return [entry, entry.sentences[Number(el.dataset.idx)]];
}

async function loadDemo() {
  const res = await fetch('data/demo.json');
  const demo = await res.json();
  const today = new Date();
  for (const d of demo.guests) {
    const g = {
      id: d.id, name: d.name, language: d.language, visitDate: dayStamp(addDays(today, d.dayOffset)), consent: d.consent,
      contact: d.consent ? { email: d.email || '', phone: '' } : null, createdAt: new Date().toISOString(), synthetic: true,
    };
    await db.put('guests', g);
    for (const box of ['liked', 'improve']) {
      if (!d[box]) continue;
      await db.put('entries', {
        id: `${d.id}_${box}`, guestId: d.id, lang: d.language, source: 'typed', box, original: d[box],
        status: 'pending', sentences: [], products: [], visitDate: g.visitDate, createdAt: new Date().toISOString(), synthetic: true,
      });
    }
  }
  await loadAll();
  state.period = 'all';
  state.tab = 'summary';
  toast('Data ya mfano imepakiwa. Bonyeza “Changanua sasa”. · Example data loaded.', 5000);
  render();
}

async function removeDemo() {
  for (const g of state.guests.filter(x => x.synthetic)) await db.del('guests', g.id);
  for (const e of state.entries.filter(x => x.synthetic || x.id.startsWith('demo_'))) await db.del('entries', e.id);
  for (const b of state.bookings.filter(x => x.synthetic)) await db.del('bookings', b.id);
  await loadAll();
  toast('Imeondolewa · Removed');
  render();
}

async function deleteGuest(id) {
  const g = guestById(id);
  if (!g || !confirm(`Futa ${g.name} na maoni yake yote?\n\nDelete ${g.name} and all their feedback?`)) return;
  await db.del('guests', id);
  for (const e of state.entries.filter(x => x.guestId === id)) await db.del('entries', e.id);
  for (const m of state.messages.filter(x => x.guestId === id)) await db.del('messages', m.id);
  await loadAll();
  render();
}

async function shareReport() {
  if (!state.shareOk) return;
  const text = document.getElementById('report-text')?.textContent || '';
  if (navigator.share) {
    try { await navigator.share({ title: 'Ripoti ya maoni', text }); } catch { /* user cancelled */ }
  } else {
    await copyText(text);
  }
}

const actions = {
  go: el => { state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'toggle-en': async () => {
    const hide = !document.body.classList.contains('hide-en');
    document.body.classList.toggle('hide-en', hide);
    await db.setSetting('showEn', !hide);
  },
  sync: syncBookings,
  'add-booking': addBooking,
  'download-pack': el => downloadPacks([el.dataset.lang]),
  'download-suggested': () => downloadPacks(currentPlan().download),
  'download-recommended': () => downloadPacks(currentPlan().recommend),
  'delete-pack': el => deletePacks([el.dataset.lang]),
  'delete-removable': () => deletePacks(currentPlan().removable),
  'download-shared': async el => { if (await confirmDownload([['shared', el.dataset.key]])) render(); },
  'pick-booking': el => pickBooking(el.dataset.id),
  'pick-guest': el => { state.add = freshAdd(); state.add.guestId = el.dataset.id; state.add.step = 2; render(); },
  'save-new-guest': saveNewGuest,
  'change-guest': () => { state.add.step = 1; render(); },
  'add-typed': () => { state.add.inputs.push({ id: uid('in'), source: 'typed', box: 'liked', text: '', status: 'ready' }); render(); },
  record: toggleRecording,
  'remove-input': el => { state.add.inputs = state.add.inputs.filter(i => i.id !== el.dataset.id); render(); },
  'use-hint': async el => {
    const g = currentGuest();
    g.language = el.dataset.lang;
    await db.put('guests', g);
    state.add.inputs.forEach(i => { i.langHint = null; });
    toast(`Lugha: ${LANGS[g.language].sw} · ${LANGS[g.language].en}`);
    render();
  },
  'run-analysis': runAnalysis,
  'finish-add': () => { state.add = freshAdd(); state.tab = 'summary'; render(); window.scrollTo(0, 0); },
  'more-feedback': () => { const id = state.add.guestId; state.add = freshAdd(); state.add.guestId = id; state.add.step = 2; render(); },
  'fix-mood': async el => {
    const [entry, s] = findSentence(el);
    if (!s) return;
    s.sentiment = el.dataset.mood;
    s.flags = (s.flags || []).filter(f => f === 'topic-unsure' && s.topic === 'other');
    s.confirmed = s.topic !== 'other';
    await saveEntry(entry);
  },
  'confirm-sent': async el => {
    const [entry, s] = findSentence(el);
    if (!s) return;
    s.confirmed = true;
    s.flags = [];
    await saveEntry(entry);
  },
  'sw-mood': async el => {
    const entry = state.entries.find(e => e.id === el.dataset.entry);
    if (!entry) return;
    const s = entry.sentences?.[0] || { en: '', original: entry.original, topic: 'other', flags: [], confirmed: true, tagged: 'human' };
    s.sentiment = el.dataset.mood;
    entry.sentences = [s];
    await saveEntry(entry);
  },
  period: el => { state.period = el.dataset.period; render(); },
  speak: async () => {
    const { s, text } = currentSummary();
    // Natural Swahili voice clips (ElevenLabs, generated at build time); phone voice as fallback.
    const played = await playClips(summaryClipIds(s));
    if (!played) speak(text.sw.join(' '));
  },
  'analyze-pending': analyzePending,
  share: shareReport,
  'toggle-draft': el => { state.openGuest = state.openGuest === el.dataset.id ? null : el.dataset.id; render(); },
  'mark-sent': async el => {
    // The link itself opens the email/SMS app; Noor presses send there. We only record it.
    const msg = { id: uid('msg'), guestId: el.dataset.id, lang: el.dataset.lang, status: 'sent', at: new Date().toISOString() };
    await db.put('messages', msg);
    state.messages.push(msg);
    setTimeout(render, 400);
  },
  copy: el => copyText(document.getElementById(el.dataset.copyFrom)?.textContent || ''),
  'delete-guest': el => deleteGuest(el.dataset.id),
  'load-demo': loadDemo,
  'remove-demo': removeDemo,
  wipe: async () => {
    if (!confirm('Futa data YOTE kwenye simu hii? Haiwezi kurudishwa.\n\nDelete ALL data on this phone? This cannot be undone.')) return;
    await db.wipeAll();
    await loadAll();
    state.add = freshAdd();
    toast('Data yote imefutwa · All data deleted');
    render();
  },
};

const changeHandlers = {
  'consent-toggle': el => document.getElementById('contact-fields')?.classList.toggle('hidden', !el.checked),
  'bk-consent-toggle': el => document.getElementById('bk-email-wrap')?.classList.toggle('hidden', !el.checked),
  box: el => { const i = state.add.inputs.find(x => x.id === el.dataset.id); if (i) i.box = el.value; },
  'fix-topic': async el => {
    const [entry, s] = findSentence(el);
    if (!s) return;
    s.topic = el.value;
    s.flags = (s.flags || []).filter(f => f !== 'topic-unsure');
    s.confirmed = s.topic !== 'other' && s.sentiment !== 'unsure';
    await saveEntry(entry);
  },
  'sw-topic': async el => {
    const entry = state.entries.find(e => e.id === el.dataset.entry);
    if (!entry || !el.value) return;
    const s = entry.sentences?.[0] || { en: '', original: entry.original, sentiment: 'unsure', flags: [], confirmed: true, tagged: 'human' };
    s.topic = el.value;
    entry.sentences = [s];
    await saveEntry(entry);
  },
  'share-ok': el => {
    state.shareOk = el.checked;
    const b = document.getElementById('share-btn');
    if (b) b.disabled = !el.checked;
  },
};

const inputHandlers = {
  'input-text': el => { const i = state.add.inputs.find(x => x.id === el.dataset.id); if (i) i.text = el.value; refreshAnalyseButton(); },
  'input-english': el => { const i = state.add.inputs.find(x => x.id === el.dataset.id); if (i) i.english = el.value; },
};

function refreshAnalyseButton() {
  const b = document.querySelector('[data-action="run-analysis"]');
  if (!b) return;
  const ready = state.add.inputs.some(i => i.status === 'ready' && (i.text || '').trim());
  const working = state.add.inputs.some(i => i.status === 'working');
  b.disabled = !(ready && !working);
}

// ---------------------------------------------------------------- wiring
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'BUTTON') e.preventDefault();
  Promise.resolve(fn(el, e)).catch(err => {
    console.error(err);
    hideBusy();
    toast(`Hitilafu · Error: ${err.message}`, 6000);
  });
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('input[type=file][data-file]')) {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    const kind = el.dataset.file;
    const job = kind === 'audio' ? addAudio(file) : addPhoto(file, kind === 'photo-liked' ? 'liked' : 'improve');
    job.catch(err => { hideBusy(); toast(err.message, 6000); });
    return;
  }
  const fn = changeHandlers[el.dataset.change];
  if (fn) Promise.resolve(fn(el)).catch(err => toast(err.message, 6000));
});

document.addEventListener('input', e => {
  const fn = inputHandlers[e.target.dataset?.input];
  if (fn) fn(e.target);
});

window.addEventListener('online', () => { state.online = true; render(); });
window.addEventListener('offline', () => { state.online = false; render(); });

// Put everything the page already loaded into the offline cache, so the very first visit
// is enough to work offline afterwards (names of built files change with every build).
async function warmCache() {
  if (!('caches' in window)) return;
  const shell = await caches.open('kitabu-shell-v2');
  const libs = await caches.open('kitabu-libs-v1');
  const urls = new Set([new URL('index.html', location.href).href]);
  for (const e of performance.getEntriesByType('resource')) urls.add(e.name);
  await Promise.all([...urls].map(async u => {
    try {
      const url = new URL(u);
      if (url.pathname.endsWith('/data/bookings.json')) return;
      const cache = url.origin === location.origin ? shell : url.hostname === 'cdn.jsdelivr.net' ? libs : null;
      if (cache && !(await cache.match(u))) await cache.add(u);
    } catch { /* ignore */ }
  }));
}

async function start() {
  await loadAll();
  render();
  await refreshModels();
  render();
  if ('serviceWorker' in navigator && import.meta.env?.PROD) {
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(warmCache)
      .catch(err => console.warn('Offline cache not available', err));
  }
  // Voices load asynchronously on some browsers; voice clips are fetched once for offline use.
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  loadVoiceManifest().then(m => { if (m && navigator.onLine) prefetchVoice(); });
}

start().catch(err => {
  console.error(err);
  view.innerHTML = `<div class="notice neg"><strong>Hitilafu · Error</strong>${h(err.message)}</div>`;
});
