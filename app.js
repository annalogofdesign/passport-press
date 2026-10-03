// The editor: one stamp held in `state`, drawn on the stage, changed by the form.
// Nothing leaves the browser. The stamp is kept in localStorage and can travel in a link.

import { DEFAULT_STAMP, FRAMES, INKS, stampSVG, stampBox } from './render.js';
import { EXAMPLES } from './examples.js';
import { thud } from './sound.js';
import { FACES, loadFaces, measurer } from './fonts.js';
import { PAPERS, paperMarkup } from './paper.js';
import { readLogo, guessTrace, traceLogo } from './logo.js';
import { exportSVG, exportPNG, download } from './export.js';

const STORE = 'stamp-maker:stamp';
const LOGO_STORE = 'stamp-maker:logo';
const SOUND_STORE = 'stamp-maker:sound';

const form = document.getElementById('controls');
const stage = document.querySelector('[data-stage]');
const stampEl = document.querySelector('[data-press]');
const paperEl = document.querySelector('[data-paper]');
const hint = document.querySelector('[data-hint]');
const status = document.querySelector('[data-status]');
const logoError = document.querySelector('[data-logo-error]');

// ---------- Choices drawn from the renderer's own lists ----------

const FRAME_ICONS = {
  rect: '<rect x="3" y="7" width="22" height="14" rx="2.5"/>',
  postage: '<rect x="3" y="7" width="22" height="14" rx="2.5" stroke-dasharray="0.1 3.4" stroke-linecap="round" stroke-width="2.4"/>',
  octagon: '<polygon points="8,6 20,6 25,11 25,17 20,22 8,22 3,17 3,11"/>',
  oval: '<ellipse cx="14" cy="14" rx="11" ry="7.5"/>',
  circle: '<circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="6.5" stroke-width="1"/>',
  squared: '<rect x="4" y="4" width="20" height="20" rx="2.5"/><circle cx="14" cy="14" r="6.5" stroke-width="1"/>',
  postmark: '<circle cx="9.5" cy="14" r="7"/><path d="M19 10h7M19 14h7M19 18h7" stroke-width="2"/>',
};

document.querySelector('[data-frames]').innerHTML = FRAMES.map(([key, label]) =>
  `<label class="frame" title="${label}"><input type="radio" name="frame" value="${key}" class="sr-only"><span class="sr-only">${label}</span>
    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${FRAME_ICONS[key]}</svg></label>`).join('');

document.querySelector('[data-inks]').innerHTML = INKS.map(([hex, label]) =>
  `<label class="swatch" style="--c:${hex}" title="${label}"><input type="radio" name="ink" value="${hex}" class="sr-only"><span class="sr-only">${label}</span></label>`).join('')
  + '<label class="swatch swatch-custom" title="Your own colour"><input type="color" name="ink"><span class="sr-only">Your own colour</span></label>';

document.querySelector('[data-faces]').innerHTML = Object.entries(FACES).map(([key, face]) =>
  `<label style="font-family:'${face.family}',var(--ui); font-weight:${face.weight}"><input type="radio" name="font" value="${key}" class="sr-only">${face.label}</label>`).join('');

document.querySelector('[data-papers]').innerHTML = PAPERS.map(([key, label]) =>
  `<label class="paper-chip"><input type="radio" name="paper" value="${key}" class="sr-only">
    <svg viewBox="0 0 60 36" aria-hidden="true">${paperMarkup(key, { x: 0, y: 0, w: 60, h: 36 }, `chip-${key}`)}</svg>${label}</label>`).join('');

// ---------- State ----------

const CHOICES = {
  frame: FRAMES.map(([key]) => key),
  centre: ['text', 'logo'],
  font: Object.keys(FACES),
  mark: ['none', 'arrive', 'depart'],
  logoMode: ['dark', 'shape'],
  paper: PAPERS.map(([key]) => key),
};

const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fresh = () => ({ ...DEFAULT_STAMP, date: today() });

// Anything read from a link or from storage is checked against the form before it is drawn
function clean(input) {
  const stamp = fresh();
  if (!input || typeof input !== 'object') return stamp;
  for (const [key, fallback] of Object.entries(DEFAULT_STAMP)) {
    const value = input[key];
    if (typeof value !== typeof fallback) continue;
    if (CHOICES[key]) {
      if (CHOICES[key].includes(value)) stamp[key] = value;
    } else if (key === 'ink') {
      if (/^#[0-9a-f]{6}$/i.test(value)) stamp[key] = value.toLowerCase();
    } else if (typeof value === 'number') {
      const range = form.elements[key];
      const [min, max] = range ? [Number(range.min), Number(range.max)] : key === 'wobble' ? [-5, 5] : [1, 99999];
      if (Number.isFinite(value)) stamp[key] = Math.min(max, Math.max(min, value));
    } else if (typeof value === 'string') {
      stamp[key] = value.slice(0, 40);
    } else {
      stamp[key] = value;
    }
  }
  return stamp;
}

const encode = (data) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (code) => JSON.parse(new TextDecoder().decode(
  Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)),
));

function restore() {
  if (location.hash.length > 1) {
    try {
      const stamp = clean(decode(location.hash.slice(1)));
      history.replaceState(null, '', location.pathname);
      return stamp;
    } catch {
      status.textContent = 'That link was incomplete, so this is your last stamp instead.';
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved) return clean(saved);
  } catch {}
  return fresh();
}

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

const firstVisit = location.hash.length < 2 && !stored(STORE);
let state = restore();
let logoSrc = stored(LOGO_STORE);
let logoMask = null;

let saving;
function save() {
  clearTimeout(saving);
  saving = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
      if (logoSrc) localStorage.setItem(LOGO_STORE, logoSrc);
      else localStorage.removeItem(LOGO_STORE);
    } catch {} // private windows and full storage: the stamp just isn't kept
  }, 300);
}

// ---------- Drawing ----------

// The pointer over the stamp is a little rubber stamp with the current ink on its rubber.
// Held down, it is drawn lower, so it pushes into the page.
const stampCursor = (ink, down) => {
  const y = down ? 3 : 0;
  const parts = `<ellipse cx="16" cy="${6 + y}" rx="5" ry="4.5" fill="#3a2a1e"/>
    <rect x="13.5" y="${9.5 + y}" width="5" height="6" fill="#c79a66"/>
    <rect x="${down ? 6 : 7}" y="${15 + y}" width="${down ? 20 : 18}" height="7" rx="1.5" fill="#c79a66"/>
    <rect x="8" y="${22 + y}" width="16" height="3" fill="${ink}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g stroke="#fff" stroke-width="3" stroke-linejoin="round">${parts}</g>
    <g stroke="#1d1a17" stroke-width="1" stroke-linejoin="round">${parts}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 25`;
};
let cursorInk = '';
function paintCursor() {
  if (cursorInk === state.ink) return;
  cursorInk = state.ink;
  stampEl.style.setProperty('--cursor', stampCursor(state.ink, false));
  stampEl.style.setProperty('--cursor-down', stampCursor(state.ink, true));
}

function draw() {
  paintCursor();
  const face = FACES[state.font];
  stampEl.style.setProperty('--bw', stampBox(state).w.toFixed(1));
  stampEl.innerHTML = stampSVG(state, { uid: 'p', face, measure: measurer(face), logo: logoMask });
}

// The page under the stamp, in the stamp's units so its texture matches an exported file.
// Redrawn only when the paper or the stage changes, never on a keystroke.
let paperDrawn = '';
function drawPaper() {
  const { clientWidth: width, clientHeight: height } = stage;
  const key = `${state.paper}:${state.paperStrength}:${width}:${height}`;
  if (key === paperDrawn || !width) return;
  paperDrawn = key;
  const unit = Math.min(2.3, width / 400, height / 340); // the same sum as .stamp's width in styles.css
  const box = { x: -width / unit / 2, y: -height / unit / 2, w: width / unit, h: height / unit };
  paperEl.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  paperEl.innerHTML = paperMarkup(state.paper, box, 'stage', state.paperStrength);
}
new ResizeObserver(drawPaper).observe(stage);

let frame;
function changed() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => { draw(); drawPaper(); });
  save();
}

const FORMATS = {
  percent: (value) => `${Math.round(value * 100)}%`,
  times: (value) => `${value.toFixed(2)}×`,
  degrees: (value) => `${value}°`,
};

function paintOutput(key) {
  const output = form.querySelector(`output[data-for="${key}"]`);
  if (output) output.textContent = (FORMATS[output.dataset.format] || String)(state[key]);
}

// Controls that don't apply to this stamp are put away
function reveal() {
  form.querySelectorAll('[data-when]').forEach((el) => {
    const [key, values] = el.dataset.when.split('=');
    el.hidden = !values.split('|').includes(state[key]);
  });
  form.querySelector('[data-logo="empty"]').hidden = Boolean(logoSrc);
  form.querySelector('[data-logo="loaded"]').hidden = !logoSrc;
  if (logoSrc) form.querySelector('[data-logo-thumb]').src = logoSrc;

  const custom = form.querySelector('.swatch-custom');
  const isCustom = !INKS.some(([hex]) => hex === state.ink);
  custom.toggleAttribute('data-active', isCustom);
  custom.style.setProperty('--c', state.ink);
}

function sync() {
  for (const [key, value] of Object.entries(state)) {
    form.querySelectorAll(`[name="${key}"]`).forEach((input) => {
      if (input.type === 'radio') input.checked = input.value === String(value);
      else if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });
    paintOutput(key);
  }
  reveal();
}

// ---------- Logo ----------

let tracing = 0;
async function retrace() {
  const run = ++tracing;
  const mask = logoSrc ? await traceLogo(logoSrc, state) : null;
  if (run !== tracing) return;
  logoMask = mask;
  const empty = Boolean(logoSrc) && !mask;
  logoError.hidden = !empty;
  logoError.textContent = empty ? 'Nothing would print at this setting. Move the threshold, or try Invert.' : '';
  changed();
}

async function useLogo(file) {
  try {
    logoSrc = await readLogo(file);
    Object.assign(state, await guessTrace(logoSrc), { centre: 'logo' });
    sync();
    await retrace();
  } catch (error) {
    state.centre = 'logo';
    sync();
    logoError.hidden = false;
    logoError.textContent = error.message;
  }
}

form.addEventListener('click', (e) => {
  if (!e.target.closest('[data-logo-remove]')) return;
  logoSrc = null;
  sync();
  retrace();
});

// A file dropped anywhere becomes the logo
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => { if (hasFiles(e) && ++dragDepth === 1) stage.toggleAttribute('data-dropping', true); });
document.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth === 0) stage.removeAttribute('data-dropping'); });
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  stage.removeAttribute('data-dropping');
  if (e.dataTransfer.files[0]) useLogo(e.dataTransfer.files[0]);
});

// ---------- The form ----------

const LOGO_KEYS = ['logoMode', 'logoThreshold', 'logoInvert'];

form.addEventListener('input', (e) => {
  const input = e.target;
  if (!(input.name in state)) return;
  state[input.name] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
  if (input.name === 'tilt') state.wobble = 0; // the slider sets the angle exactly
  hint.textContent = HINT;
  paintOutput(input.name);
  reveal();
  if (LOGO_KEYS.includes(input.name)) retrace();
  else changed();
});

form.addEventListener('change', (e) => {
  if (e.target.name !== 'logoFile' || !e.target.files[0]) return;
  useLogo(e.target.files[0]);
  e.target.value = ''; // so choosing the same file again still fires
});

// ---------- The logo: a Passport Press stamp, pressed straight ----------

const BRAND = {
  ...DEFAULT_STAMP,
  frame: 'rect', top: '', word: 'Passport', sub: 'Press', date: '', bottom: '', mark: 'none',
  ink: '#21539c', font: 'grotesk', tilt: 0, wobble: 0, rule: 1.4, corner: 8,
  roughness: 1.2, voids: 0.2, pressure: 0.25, inkOpacity: 0.95, seed: 1917,
};
function drawBrand() {
  document.querySelector('[data-brand]').innerHTML = stampSVG(BRAND, { uid: 'brand', face: FACES.grotesk, measure: measurer(FACES.grotesk), subScale: 2.4 });
}
drawBrand();

// ---------- Pressing ----------

const HINT = 'Click the stamp to press it again';
hint.textContent = firstVisit ? 'Welcome aboard. Type your name or drop in a logo to make this stamp yours.' : HINT;

// Fresh ink, and a few degrees either side of the tilt; never the same side twice running
function reink() {
  state.seed = 1 + Math.floor(Math.random() * 99999);
  const side = state.wobble > 0 ? -1 : state.wobble < 0 ? 1 : Math.random() < 0.5 ? -1 : 1;
  state.wobble = side * Math.round(1 + Math.random() * 3);
}

let running = [];

// Sound is on unless someone turned it off
const soundButton = document.querySelector('[data-sound]');
let soundOn = stored(SOUND_STORE) !== 'off';
function paintSound() {
  soundButton.setAttribute('aria-pressed', String(soundOn));
  soundButton.title = soundOn ? 'Sound on' : 'Sound off';
}
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  paintSound();
  try { localStorage.setItem(SOUND_STORE, soundOn ? 'on' : 'off'); } catch {}
});
paintSound();

// Ink on impact: it's there at once, the stamp settles, the paper jolts.
// `loud` is only for presses someone asked for: browsers won't play sound before a click anyway.
function land({ delay = 0, loud = true } = {}) {
  running.forEach((animation) => animation.cancel());
  draw();
  if (loud && soundOn) thud(delay / 1000);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const timing = { duration: 240, delay, fill: 'backwards', easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
  running = [
    stampEl.animate([
      { opacity: 0, transform: 'scale(1.03)' },
      { opacity: 1, transform: 'scale(1.03)', offset: 0.05 },
      { opacity: 1, transform: 'scale(1)' },
    ], timing),
    paperEl.animate([{ transform: 'translateY(1.5px)' }, { transform: 'translateY(0)' }], timing),
  ];
}

stampEl.addEventListener('click', () => {
  reink();
  save();
  land();
});

// Ready-made stamps, in turn, starting after the one a new visitor sees
let example = 0;
document.querySelector('[data-surprise]').addEventListener('click', () => {
  example = (example + 1) % EXAMPLES.length;
  const { date, ...stamp } = EXAMPLES[example];
  Object.assign(state, stamp, { centre: 'text', date: date ? today() : '' });
  reink();
  hint.textContent = HINT;
  status.textContent = '';
  sync();
  save();
  land();
});

// ---------- Leaving with a stamp ----------

const fileName = () => {
  const words = state.centre === 'text' ? `${state.word} ${state.sub}` : state.top;
  const slug = words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `stamp${slug ? `-${slug}` : ''}`;
};

const exportOptions = () => ({
  logo: logoMask,
  width: Number(form.elements.pngWidth.value),
  paper: form.elements.withPaper.checked,
});

// Each button says what happened, then goes back to what it does
async function act(button, done, run) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  status.textContent = '';
  try {
    await run();
    button.textContent = done;
    setTimeout(() => { button.textContent = label; }, 1500);
  } catch (error) {
    status.textContent = error.userMessage || 'That didn’t work. Try again, or try another browser.';
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  act(form.querySelector('[data-png]'), 'Downloaded', async () => {
    download(await exportPNG(state, exportOptions()), `${fileName()}.png`);
  });
});

form.querySelector('[data-svg]').addEventListener('click', (e) => {
  act(e.currentTarget, 'Saved', async () => {
    const svg = await exportSVG(state, exportOptions());
    download(new Blob([svg], { type: 'image/svg+xml' }), `${fileName()}.svg`);
  });
});

form.querySelector('[data-copy]').addEventListener('click', (e) => {
  act(e.currentTarget, 'Copied', async () => {
    if (!window.ClipboardItem) throw Object.assign(new Error('No image clipboard'), { userMessage: 'This browser can’t copy images. Download the PNG instead.' });
    // The promise goes in unresolved so Safari still counts this as part of the click
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportPNG(state, exportOptions()) })]);
  });
});

document.querySelector('[data-share]').addEventListener('click', (e) => {
  act(e.currentTarget, 'Link copied', async () => {
    const changes = Object.fromEntries(Object.entries(state).filter(([key, value]) => DEFAULT_STAMP[key] !== value));
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${encode(changes)}`);
    if (state.centre === 'logo' && logoSrc) status.textContent = 'Link copied. Your logo stays on this device, so the link shows the words instead.';
  });
});

document.querySelector('[data-reset]').addEventListener('click', () => {
  if (!confirm('Start over with a new stamp? This one will be cleared.')) return;
  state = fresh();
  logoSrc = null;
  example = 0;
  status.textContent = '';
  sync();
  retrace();
  land();
});

// ---------- Start ----------

sync();
draw();
drawPaper();
retrace();
// Once a visit, the first stamp is pressed in front of you
try {
  if (!sessionStorage.getItem('stamp-maker:landed')) {
    sessionStorage.setItem('stamp-maker:landed', '1');
    requestAnimationFrame(() => land({ delay: 350, loud: false }));
  }
} catch {}
loadFaces(() => { draw(); drawBrand(); }); // text refits as each face's real metrics arrive
