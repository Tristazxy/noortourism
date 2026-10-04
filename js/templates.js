// Human-written text templates. The AI never writes free text for Noor or for guests:
// it only fills in counts, dates, names and topic names from fixed lists.
// Swahili and translations should be checked by native speakers before real use.

import { TOPICS, topicById, PRODUCTS } from './topics.js';
import { LANGS, langName } from './langs.js';

const DAYS_SW = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function daySw(date) {
  const d = new Date(date);
  return `${DAYS_SW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
export function dayEn(date) {
  const d = new Date(date);
  return `${DAYS_EN[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

// ---------- Weekly SMS to Noor's basic phone (Swahili) ----------
export function weeklySms(bookings) {
  if (!bookings.length) {
    return 'Kitabu: Hakuna wageni waliopangwa wiki ijayo.';
  }
  const total = bookings.reduce((n, b) => n + (Number(b.guests) || 1), 0);
  const lines = bookings
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(b => `${daySw(b.date)}: wageni ${b.guests} (${langName(b.language, 'sw')})${b.guide ? `, mwongozaji ${b.guide}` : ''}`);
  return `Kitabu: Wiki ijayo wageni ${total}.\n${lines.join('\n')}\nJibu NDIYO kukubali au HAPANA kukataa.`;
}

// ---------- Swahili summary for Noor ----------
/**
 * @param {Object} s  stats from summarize()
 * returns {sw: string[], en: string[]} paragraphs
 */
export function summaryText(s) {
  const sw = [];
  const en = [];
  sw.push(`Kipindi hiki: wageni ${s.guests}, maoni ${s.entries}.`);
  en.push(`This period: ${s.guests} guests, ${s.entries} feedback entries.`);

  if (s.guests === 0) {
    sw.push('Bado hakuna maoni. Ongeza maoni ya wageni kwanza.');
    en.push('No feedback yet. Add guest feedback first.');
    return { sw, en };
  }

  const fewData = s.guests < 5;
  if (fewData) {
    sw.push(`Tahadhari: maoni bado ni machache (wageni ${s.guests}). Ni mapema kufanya uamuzi mkubwa.`);
    en.push(`Caution: still little feedback (${s.guests} guests). Too early for big decisions.`);
  }

  const topLiked = s.liked.filter(x => x.id !== 'other').slice(0, 3);
  if (topLiked.length) {
    sw.push('Walichopenda zaidi: ' + topLiked.map(x => `${topicById(x.id).sw.split(' (')[0].toLowerCase()} (wageni ${x.guests})`).join('; ') + '.');
    en.push('What they liked most: ' + topLiked.map(x => `${topicById(x.id).en.toLowerCase()} (${x.guests} guests)`).join('; ') + '.');
  }

  const topImprove = s.improve.filter(x => x.id !== 'other').slice(0, 3);
  if (topImprove.length) {
    sw.push('Wanachotaka kiboreshwe: ' + topImprove.map(x => `${topicById(x.id).sw.split(' (')[0].toLowerCase()} (wageni ${x.guests})`).join('; ') + '.');
    en.push('What they want improved: ' + topImprove.map(x => `${topicById(x.id).en.toLowerCase()} (${x.guests} guests)`).join('; ') + '.');
  } else {
    sw.push('Hakuna malalamiko yaliyotajwa.');
    en.push('No complaints were mentioned.');
  }

  if (s.products.length) {
    sw.push('Bidhaa ambazo wageni walitaka kununua: ' + s.products.map(p => `${PRODUCTS.find(x => x.id === p.id).sw} (wageni ${p.guests})`).join('; ') + '.');
    en.push('Products guests wanted to buy: ' + s.products.map(p => `${PRODUCTS.find(x => x.id === p.id).en} (${p.guests} guests)`).join('; ') + '.');
  }

  // New product idea only with enough evidence: >= 3 guests AND >= 40% of guests.
  const strong = s.products.find(p => p.guests >= 3 && p.guests / s.guests >= 0.4);
  if (strong) {
    const p = PRODUCTS.find(x => x.id === strong.id);
    sw.push(`Wazo: wageni ${strong.guests} kati ya ${s.guests} walitaka ${p.sw}. Unaweza kufikiria kuuza ${p.sw}. Uamuzi ni wako.`);
    en.push(`Idea: ${strong.guests} of ${s.guests} guests wanted ${p.en}. You could consider selling ${p.en}. The decision is yours.`);
  }

  if (s.unsure > 0) {
    sw.push(`Sentensi ${s.unsure} hazikueleweka vizuri. Tafadhali ziangalie pamoja na msaidizi wako au mwongozaji.`);
    en.push(`${s.unsure} sentences were not understood well. Please check them with your helper or the guide.`);
  }
  if (s.swahiliEntries > 0) {
    sw.push(`Maoni ${s.swahiliEntries} yameandikwa kwa Kiswahili — yasome mwenyewe.`);
    en.push(`${s.swahiliEntries} entries are in Swahili — Noor reads them directly.`);
  }
  return { sw, en };
}

// ---------- Thank-you messages (guest language, with a parallel Swahili version for Noor) ----------
const THANKS = {
  sw: {
    liked: (n, x) => `Mpendwa ${n}, asante kwa kutembelea shamba letu la kahawa! Tunafurahi kwamba ulipenda ${x}. Karibu tena wakati wowote, na tafadhali waambie marafiki zako kuhusu sisi. — Noor`,
    plain: n => `Mpendwa ${n}, asante kwa kutembelea shamba letu la kahawa! Tunatumaini ulifurahia ziara yako. Karibu tena wakati wowote, na tafadhali waambie marafiki zako kuhusu sisi. — Noor`,
  },
  en: {
    liked: (n, x) => `Dear ${n}, thank you for visiting our coffee farm! We are glad you enjoyed ${x}. You are always welcome back, and please tell your friends about us. — Noor`,
    plain: n => `Dear ${n}, thank you for visiting our coffee farm! We hope you enjoyed your visit. You are always welcome back, and please tell your friends about us. — Noor`,
  },
  it: {
    liked: (n, x) => `Ciao ${n}, grazie per aver visitato la nostra fattoria del caffè! Ci fa piacere sapere che hai apprezzato: ${x}. Torna a trovarci quando vuoi e, se ti fa piacere, parla di noi ai tuoi amici. — Noor`,
    plain: n => `Ciao ${n}, grazie per aver visitato la nostra fattoria del caffè! Speriamo che la visita ti sia piaciuta. Torna a trovarci quando vuoi e, se ti fa piacere, parla di noi ai tuoi amici. — Noor`,
  },
  fr: {
    liked: (n, x) => `Bonjour ${n}, merci d’avoir visité notre ferme de café ! Nous sommes heureux que vous ayez apprécié : ${x}. Notre porte vous est toujours ouverte — n’hésitez pas à parler de nous à vos amis. — Noor`,
    plain: n => `Bonjour ${n}, merci d’avoir visité notre ferme de café ! Nous espérons que la visite vous a plu. Notre porte vous est toujours ouverte — n’hésitez pas à parler de nous à vos amis. — Noor`,
  },
  de: {
    liked: (n, x) => `Hallo ${n}, vielen Dank für Ihren Besuch auf unserer Kaffeefarm! Es freut uns, dass Ihnen Folgendes gefallen hat: ${x}. Sie sind jederzeit wieder willkommen – erzählen Sie gern Ihren Freunden von uns. — Noor`,
    plain: n => `Hallo ${n}, vielen Dank für Ihren Besuch auf unserer Kaffeefarm! Wir hoffen, der Besuch hat Ihnen gefallen. Sie sind jederzeit wieder willkommen – erzählen Sie gern Ihren Freunden von uns. — Noor`,
  },
  zh: {
    liked: (n, x) => `${n}您好！感谢您来参观我们的咖啡农场。很高兴您喜欢：${x}。欢迎您随时再来，也欢迎把我们介绍给您的朋友。—— Noor`,
    plain: n => `${n}您好！感谢您来参观我们的咖啡农场。希望您这次参观愉快。欢迎您随时再来，也欢迎把我们介绍给您的朋友。—— Noor`,
  },
  es: {
    liked: (n, x) => `Hola ${n}, ¡gracias por visitar nuestra finca de café! Nos alegra saber que disfrutaste: ${x}. Vuelve cuando quieras y, si te apetece, háblales de nosotros a tus amigos. — Noor`,
    plain: n => `Hola ${n}, ¡gracias por visitar nuestra finca de café! Esperamos que hayas disfrutado la visita. Vuelve cuando quieras y, si te apetece, háblales de nosotros a tus amigos. — Noor`,
  },
  pl: {
    liked: (n, x) => `Dzień dobry ${n}, dziękujemy za odwiedzenie naszej farmy kawy! Cieszymy się, że spodobało się Państwu: ${x}. Zapraszamy ponownie – i prosimy polecić nas znajomym. — Noor`,
    plain: n => `Dzień dobry ${n}, dziękujemy za odwiedzenie naszej farmy kawy! Mamy nadzieję, że wizyta się podobała. Zapraszamy ponownie – i prosimy polecić nas znajomym. — Noor`,
  },
};

/**
 * Build a thank-you message. Returns {lang, text, sw, usedFallback}.
 * `sw` is the exact Swahili equivalent so Noor knows what she is approving.
 */
export function thankYou(guest, likedTopicId) {
  const lang = THANKS[guest.language] ? guest.language : 'en';
  const usedFallback = lang !== guest.language;
  const name = (guest.name || '').trim() || (lang === 'zh' ? '' : 'friend');
  const t = likedTopicId ? TOPICS.find(x => x.id === likedTopicId) : null;
  const make = (L) => (t ? THANKS[L].liked(name, t.msg[L] || t.msg.en) : THANKS[L].plain(name));
  return { lang, text: make(lang), sw: make('sw'), usedFallback };
}

export function hasTemplate(code) {
  return Boolean(THANKS[code]);
}

// ---------- Anonymized report for the guide / tourism centre ----------
export function guideReport(s, periodLabel) {
  const lines = [];
  lines.push(`Ripoti ya maoni — ${periodLabel}`);
  lines.push(`Feedback report — ${periodLabel}`);
  lines.push('');
  lines.push(`Wageni / Guests: ${s.guests}`);
  const langs = Object.entries(s.languages).map(([c, n]) => `${LANGS[c] ? LANGS[c].en : c} ${n}`).join(', ');
  if (langs) lines.push(`Lugha / Languages: ${langs}`);
  lines.push('');
  lines.push('Walichopenda / Liked:');
  for (const x of s.liked.filter(x => x.id !== 'other').slice(0, 5)) lines.push(`  • ${topicById(x.id).en}: ${x.guests}`);
  lines.push('Kuboresha / To improve:');
  const imp = s.improve.filter(x => x.id !== 'other').slice(0, 5);
  if (!imp.length) lines.push('  • —');
  for (const x of imp) lines.push(`  • ${topicById(x.id).en}: ${x.guests}`);
  if (s.products.length) {
    lines.push('Bidhaa / Product interest:');
    for (const p of s.products) lines.push(`  • ${PRODUCTS.find(x => x.id === p.id).en}: ${p.guests}`);
  }
  lines.push('');
  lines.push('Hakuna majina wala namba za wageni. / No guest names or contact details included.');
  lines.push('Imeidhinishwa na Noor kabla ya kutumwa. / Approved by Noor before sharing.');
  return lines.join('\n');
}
