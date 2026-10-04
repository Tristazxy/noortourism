// Small UI helpers: escaping, bilingual labels, toast, busy/progress panel, speech, dates.

export function h(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Swahili first, English underneath (hidden when the EN toggle is off).
export function L(sw, en) {
  return `<span>${sw}</span><span class="en">${en}</span>`;
}
export function Li(sw, en) {
  return `${sw} <span class="en inline">· ${en}</span>`;
}

let toastTimer = null;
export function toast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- busy panel with progress ----------
let busyEl = null;
function ensureBusy() {
  if (busyEl) return busyEl;
  busyEl = document.createElement('div');
  busyEl.className = 'busy hidden';
  busyEl.setAttribute('role', 'status');
  busyEl.setAttribute('aria-live', 'polite');
  busyEl.innerHTML = '<div class="busy-label"></div><div class="progress"><span></span></div><div class="progress-label"></div>';
  document.body.appendChild(busyEl);
  return busyEl;
}
export function showBusy(label) {
  const el = ensureBusy();
  el.querySelector('.busy-label').textContent = label;
  el.querySelector('.progress > span').style.width = '0%';
  el.querySelector('.progress-label').textContent = '';
  el.classList.remove('hidden');
}
export function progress(p) {
  const el = ensureBusy();
  el.classList.remove('hidden');
  if (p.label) el.querySelector('.busy-label').textContent = p.label;
  const f = Math.max(0, Math.min(1, p.fraction || 0));
  el.querySelector('.progress > span').style.width = `${Math.round(f * 100)}%`;
  el.querySelector('.progress-label').textContent = p.total
    ? `${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB`
    : p.done ? 'Tayari · ready' : `${Math.round(f * 100)}%`;
}
export function hideBusy() {
  if (busyEl) busyEl.classList.add('hidden');
}

// ---------- speech (reads the Swahili summary aloud if the phone has a Swahili voice) ----------
export function speak(text) {
  if (!('speechSynthesis' in window)) {
    toast('Simu hii haiwezi kusoma kwa sauti. · This phone cannot read aloud.');
    return;
  }
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => /^sw/i.test(v.lang));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : 'sw-KE';
  if (voice) u.voice = voice;
  else toast('Hakuna sauti ya Kiswahili kwenye simu hii; matamshi yanaweza kuwa mabaya. · No Swahili voice installed.', 5000);
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- dates ----------
export function isoDate(d) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
// Dates are stored as local noon ("YYYY-MM-DDT12:00:00", no zone) so the weekday never shifts by timezone.
export function dayStamp(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00`;
  return `${isoDate(d)}T12:00:00`;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function daysFromToday(dateStr) {
  const a = new Date(isoDate(new Date()) + 'T00:00:00');
  const b = new Date(isoDate(dateStr) + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
export function parseLocalDate(s) {
  // "YYYY-MM-DD" -> local midnight (avoids the UTC shift of new Date("YYYY-MM-DD"))
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Imenakiliwa · Copied');
  } catch {
    toast('Imeshindwa kunakili · Could not copy');
  }
}
