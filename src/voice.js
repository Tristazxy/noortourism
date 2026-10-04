// Spoken Swahili summary for Noor, built from short pre-recorded clips.
// Clips are generated once at build time with ElevenLabs (tools/make_audio.py) from the
// human-written phrases in audio/phrases-sw.json, then play offline from the phone's cache.
// If clips are missing, the app falls back to the phone's own text-to-speech.

import { strongProduct } from './templates.js';

let manifest;

export async function loadVoiceManifest() {
  if (manifest !== undefined) return manifest;
  try {
    const res = await fetch('audio/sw/manifest.json');
    manifest = res.ok ? await res.json() : null;
  } catch {
    manifest = null;
  }
  return manifest;
}

export function hasVoice() {
  return Boolean(manifest && manifest.files && Object.keys(manifest.files).length);
}

const guestsClip = n => (n >= 1 && n <= 20 ? `g_${n}` : 'g_more');

// Same structure and the same rules as summaryText() in templates.js.
export function summaryClipIds(s) {
  if (!s.guests) return ['no_feedback'];
  const ids = ['period', guestsClip(s.guests), 'gave_feedback'];
  if (s.guests < 5) ids.push('few_data');
  const liked = s.liked.filter(x => x.id !== 'other').slice(0, 3);
  if (liked.length) {
    ids.push('liked_intro');
    for (const x of liked) ids.push(`t_${x.id}`, guestsClip(x.guests));
  }
  const improve = s.improve.filter(x => x.id !== 'other').slice(0, 3);
  if (improve.length) {
    ids.push('improve_intro');
    for (const x of improve) ids.push(`t_${x.id}`, guestsClip(x.guests));
  } else {
    ids.push('no_complaints');
  }
  if (s.products.length) {
    ids.push('products_intro');
    for (const p of s.products) ids.push(`p_${p.id}`, guestsClip(p.guests));
  }
  const strong = strongProduct(s);
  if (strong) ids.push('idea_intro', `p_${strong.id}`, 'idea_outro');
  if (s.unsure > 0) ids.push('unsure');
  if (s.swahiliEntries > 0) ids.push('swahili_entries');
  return ids;
}

let token = 0;
let current = null;

export function stopVoice() {
  token++;
  if (current) { current.pause(); current = null; }
}

// Plays the clips in order. Returns false (and plays nothing) if any clip is missing.
export async function playClips(ids) {
  const m = await loadVoiceManifest();
  if (!m || !ids.every(id => m.files[id])) return false;
  stopVoice();
  const mine = ++token;
  for (const id of ids) {
    if (mine !== token) break;
    await new Promise(resolve => {
      const a = new Audio(`audio/sw/${m.files[id]}`);
      current = a;
      a.onended = resolve;
      a.onerror = resolve;
      a.play().catch(resolve);
    });
  }
  current = null;
  return true;
}

// Download every clip once so the summary can be heard offline all week.
export async function prefetchVoice() {
  const m = await loadVoiceManifest();
  if (!m) return;
  await Promise.all(Object.values(m.files).map(f => fetch(`audio/sw/${f}`).catch(() => null)));
}
