// Turn analyzed feedback entries into counts. Pure logic.

export function inPeriod(dateStr, period, today = new Date()) {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const days = period === 'week' ? 7 : period === 'month' ? 31 : 3650;
  return today - d <= days * 24 * 3600 * 1000 && d - today <= 24 * 3600 * 1000;
}

/**
 * @param {Array} entries  analyzed feedback entries
 * @param {Array} guests
 */
export function summarize(entries, guests) {
  const guestById = Object.fromEntries(guests.map(g => [g.id, g]));
  const guestSet = new Set();
  const languages = {};
  const liked = {};
  const improve = {};
  const products = {};
  let unsure = 0;
  let swahiliEntries = 0;

  const bump = (map, key, guestId, quote) => {
    if (!map[key]) map[key] = { id: key, guestIds: new Set(), quotes: [] };
    map[key].guestIds.add(guestId);
    if (quote) map[key].quotes.push(quote);
  };

  for (const e of entries) {
    guestSet.add(e.guestId);
    if (e.lang === 'sw') swahiliEntries++;
    for (const s of e.sentences || []) {
      const needsCheck = s.topic === 'other' || s.sentiment === 'unsure' || (s.flags && s.flags.length && !s.confirmed);
      if (needsCheck) unsure++;
      const quote = { entryId: e.id, en: s.en, original: s.original || null, lang: e.lang, flagged: needsCheck };
      if (s.sentiment === 'pos') bump(liked, s.topic, e.guestId, quote);
      else if (s.sentiment === 'neg') bump(improve, s.topic, e.guestId, quote);
    }
    for (const p of e.products || []) bump(products, p, e.guestId, null);
  }
  for (const id of guestSet) {
    const g = guestById[id];
    const lang = g ? g.language : 'unknown';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  const finish = map => Object.values(map)
    .map(x => ({ id: x.id, guests: x.guestIds.size, quotes: x.quotes }))
    .sort((a, b) => b.guests - a.guests);

  return {
    guests: guestSet.size,
    entries: entries.length,
    liked: finish(liked),
    improve: finish(improve),
    products: finish(products),
    unsure,
    swahiliEntries,
    languages,
  };
}

// The topic a guest liked most (for the thank-you message). Null if none is clear.
export function guestTopLiked(entries, guestId) {
  const counts = {};
  for (const e of entries.filter(x => x.guestId === guestId)) {
    for (const s of e.sentences || []) {
      if (s.sentiment === 'pos' && s.topic !== 'other') counts[s.topic] = (counts[s.topic] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}
