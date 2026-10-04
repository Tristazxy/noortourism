// Scoring helpers shared by the browser accuracy page and the GitHub accuracy run.

// Corpus-level chrF (character n-grams 1..6, beta = 2, whitespace removed), as in sacreBLEU.
export function corpusChrF(hyps, refs, N = 6, beta = 2) {
  const stats = Array.from({ length: N }, () => ({ match: 0, hyp: 0, ref: 0 }));
  const grams = (s, n) => {
    const t = String(s || '').replace(/\s+/g, '');
    const m = new Map();
    for (let i = 0; i + n <= t.length; i++) {
      const g = t.slice(i, i + n);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  hyps.forEach((h, i) => {
    for (let n = 1; n <= N; n++) {
      const H = grams(h, n);
      const R = grams(refs[i], n);
      const st = stats[n - 1];
      for (const v of H.values()) st.hyp += v;
      for (const v of R.values()) st.ref += v;
      for (const [g, c] of H) st.match += Math.min(c, R.get(g) || 0);
    }
  });
  let P = 0, Rc = 0, k = 0;
  for (const st of stats) {
    if (st.hyp && st.ref) { P += st.match / st.hyp; Rc += st.match / st.ref; k++; }
  }
  if (!k) return 0;
  P /= k; Rc /= k;
  if (P + Rc === 0) return 0;
  const b2 = beta * beta;
  return Number(((1 + b2) * P * Rc / (b2 * P + Rc) * 100).toFixed(1));
}

/**
 * items: [{text, topic}] (gold topic may be 'other'); preds: [{topic}]
 */
export function scoreTopics(items, preds) {
  let realN = 0, answered = 0, correctAnswered = 0, otherN = 0, otherAbstained = 0;
  const errors = [];
  items.forEach((it, i) => {
    const p = preds[i].topic;
    if (it.topic === 'other') {
      otherN++;
      if (p === 'other') otherAbstained++;
      else errors.push({ text: it.text, gold: it.topic, pred: p, score: preds[i].score });
      return;
    }
    realN++;
    if (p !== 'other') {
      answered++;
      if (p === it.topic) correctAnswered++;
      else errors.push({ text: it.text, gold: it.topic, pred: p, score: preds[i].score });
    }
  });
  const pct = (a, b) => (b ? Number(((a / b) * 100).toFixed(1)) : null);
  return {
    n: items.length,
    accuracy: pct(correctAnswered, realN),            // correct / all items with a real topic
    precisionWhenAnswered: pct(correctAnswered, answered),
    coverage: pct(answered, realN),                   // share where the model gave an answer
    abstainOnOther: pct(otherAbstained, otherN),      // said "not sure" when the sentence had no topic
    errors,
  };
}

/** items: [{text, mood: 'pos'|'neg'|null}], preds: [{label, score}], threshold */
export function scoreMood(items, preds, threshold) {
  let n = 0, answered = 0, correct = 0;
  const errors = [];
  items.forEach((it, i) => {
    if (!it.mood) return;
    n++;
    const p = preds[i];
    if (p.score < threshold) return; // app would say "not sure"
    answered++;
    if (p.label === it.mood) correct++;
    else errors.push({ text: it.text, gold: it.mood, pred: p.label, score: p.score });
  });
  const pct = (a, b) => (b ? Number(((a / b) * 100).toFixed(1)) : null);
  return { n, accuracy: pct(correct, n), precisionWhenAnswered: pct(correct, answered), coverage: pct(answered, n), errors };
}
