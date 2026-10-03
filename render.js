// A passport stamp as a pure function of (stamp, options). The same stamp, seed
// included, always draws the same SVG; every random draw comes from the seed.

import { paperMarkup } from './paper.js';

// Real stamp-pad inks. Hex, so an exported SVG opens anywhere
export const INKS = [
  ['#21539c', 'Blue'],
  ['#0c2026', 'Navy'],
  ['#161616', 'Black'],
  ['#58368e', 'Violet'],
  ['#ba2b28', 'Red'],
  ['#256d4c', 'Green'],
];

export const FRAMES = [
  ['rect', 'Rectangle'],
  ['postage', 'Perforated'],
  ['octagon', 'Octagon'],
  ['oval', 'Oval'],
  ['circle', 'Round'],
  ['squared', 'Round in a square'],
  ['postmark', 'Postmark'],
];

export const DEFAULT_STAMP = {
  frame: 'rect',
  top: 'Admitted',
  centre: 'text', // text | logo
  word: 'One visitor',
  sub: 'Probably human',
  date: '',
  bottom: 'No baggage declared',
  ink: '#21539c',
  inkOpacity: 0.85,
  paper: 'grid',
  paperStrength: 0.6,
  font: 'grotesk',
  rule: 1.15,
  corner: 10,
  mark: 'arrive', // none | arrive | depart
  tilt: -4,
  wobble: 0, // each press lands a few degrees either side of the tilt
  logoSize: 1,
  logoMode: 'shape', // shape | dark
  logoThreshold: 0.3,
  logoInvert: false,
  roughness: 2,
  voids: 0.4,
  pressure: 0.45,
  doubleStrike: false,
  seed: 62528,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isRound = (frame) => frame === 'circle' || frame === 'squared' || frame === 'postmark';
const hasCornerMark = (s) => s.mark !== 'none' && (s.frame === 'rect' || s.frame === 'postage');

const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const U = (s) => s.trim().toUpperCase(); // SVG text ignores text-transform in Chrome

// Without real font metrics, assume bold grotesk capitals
const estimate = (value) => value.length * 0.68;

export function frameSize(s) {
  if (isRound(s.frame)) return { W: s.frame === 'postmark' ? 300 : 210, H: 210 };
  return { W: 240, H: s.bottom.trim() ? 168 : 150 };
}

// Tighten tracking, then size, until the capitals fit the width
function fit(value, maxWidth, size, tracking, c) {
  const n = [...value].length;
  const unit = c.measure(value);
  let s = size * c.scale;
  let t = tracking;
  const width = () => unit * s + (n - 1) * t;
  while (width() > maxWidth && t > 0.6) t -= 0.2;
  if (width() > maxWidth) s = Math.max(4, (maxWidth - (n - 1) * t) / unit);
  return { size: s, attrs: `font-size="${s.toFixed(2)}" letter-spacing="${t.toFixed(2)}"` };
}

const text = (c, x, y, value, maxWidth, size, tracking, extra = '') =>
  `<text x="${x}" y="${y}" text-anchor="middle" ${fit(value, maxWidth, size, tracking, c).attrs} ${extra}>${esc(value)}</text>`;

const PLANE = 'M0,-8 C0.9,-8 1.4,-7 1.4,-5.8 L1.4,-2 L8,2.2 L8,3.8 L1.4,1.8 L1.4,5.2 L3.4,6.8 L3.4,8 L0,7 L-3.4,8 L-3.4,6.8 L-1.4,5.2 L-1.4,1.8 L-8,3.8 L-8,2.2 L-1.4,-2 L-1.4,-5.8 C-1.4,-7 -0.9,-8 0,-8 Z';

// Nose up for a departure, nose down for an arrival
const plane = (x, y, mark) =>
  `<path d="${PLANE}" transform="translate(${x} ${y}) rotate(${mark === 'arrive' ? 135 : 45}) scale(0.95)"/>`;

const star = (x, y, r) => `<polygon points="${Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const rr = i % 2 ? r * 0.42 : r;
  return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
}).join(' ')}"/>`;

function centreMark(s, c, { x, y, w, h }, wordSize) {
  const cx = x + w / 2;
  if (s.centre === 'logo' && c.logo) {
    // The logo is a white-on-clear mask, so it takes the ink colour and the ink texture
    const lw = w * s.logoSize;
    const lh = h * s.logoSize;
    const box = `x="${cx - lw / 2}" y="${y + h / 2 - lh / 2}" width="${lw}" height="${lh}"`;
    return `<mask id="lm-${c.uid}" maskUnits="userSpaceOnUse" ${box}><image href="${c.logo}" ${box} preserveAspectRatio="xMidYMid meet"/></mask>
      <rect ${box} mask="url(#lm-${c.uid})"/>`;
  }
  const [word, sub] = [U(s.word), U(s.sub)].filter(Boolean);
  if (!word) return '';
  const big = fit(word, w, wordSize, wordSize * 0.1, c);
  if (!sub) return `<text x="${cx}" y="${y + h / 2 + big.size * 0.36}" text-anchor="middle" ${big.attrs}>${esc(word)}</text>`;
  const small = fit(sub, w, 12 * c.subScale, 3, c);
  const block = big.size * 0.72 + 8 + small.size * 0.72;
  const top = y + h / 2 - block / 2;
  return `<text x="${cx}" y="${top + big.size * 0.72}" text-anchor="middle" ${big.attrs}>${esc(word)}</text>
    <text x="${cx}" y="${top + block}" text-anchor="middle" ${small.attrs}>${esc(sub)}</text>`;
}

function dateBand(c, cx, y, halfWidth, date, k) {
  return `<g fill="none" stroke-width="${k}"><line x1="${cx - halfWidth}" y1="${y}" x2="${cx + halfWidth}" y2="${y}"/><line x1="${cx - halfWidth}" y1="${y + 22}" x2="${cx + halfWidth}" y2="${y + 22}"/></g>
    ${text(c, cx, y + 15.5, date, halfWidth * 2 - 8, 12, 2.4, 'style="font-variant-numeric: tabular-nums"')}`;
}

function flatStamp(s, c, W, H) {
  const { frame } = s;
  const k = s.rule;
  const cx = W / 2;
  const top = U(s.top);
  const date = U(s.date);
  const bottom = U(s.bottom);

  const inset = (d) => {
    if (frame === 'oval') return `<ellipse cx="${cx}" cy="${H / 2}" rx="${cx - d}" ry="${H / 2 - d}"/>`;
    if (frame === 'octagon') {
      const cut = 26 - d * 0.4;
      return `<polygon points="${[[d + cut, d], [W - d - cut, d], [W - d, d + cut], [W - d, H - d - cut], [W - d - cut, H - d], [d + cut, H - d], [d, H - d - cut], [d, d + cut]].map((p) => p.join(',')).join(' ')}"/>`;
    }
    return `<rect x="${d}" y="${d}" width="${W - 2 * d}" height="${H - 2 * d}" rx="${Math.max(s.corner - (d - 3), 1)}"/>`;
  };
  const outer = frame === 'postage'
    ? `<g stroke-width="${5 * k}" stroke-dasharray="0.1 7" stroke-linecap="round">${inset(3)}</g>`
    : `<g stroke-width="${4 * k}">${inset(3)}</g>`;

  const narrow = frame === 'oval' ? 0.58 : frame === 'octagon' ? 0.66 : 0.8;
  const cornerMark = hasCornerMark(s);
  const topY = frame === 'oval' ? 44 : 36;
  const dateTop = frame === 'oval' ? 98 : 102;
  const topText = !top ? '' : cornerMark
    ? text(c, cx - 12, topY, top, W * narrow - 30, 12, 3)
    : text(c, cx, topY, top, W * narrow, 12, 3);

  // The centre takes whatever room the lines around it leave free
  const boxTop = top || cornerMark ? topY + 8 : topY - 10;
  const boxBottom = date ? dateTop - 6 : bottom ? dateTop + 18 : H - (frame === 'oval' ? 40 : 28);
  const box = { x: 46, y: boxTop, w: W - 92, h: boxBottom - boxTop };

  return `${outer}<g stroke-width="${1.4 * k}">${inset(11)}</g>
    <g fill="currentColor" stroke="none">
      ${topText}
      ${cornerMark ? plane(W - 30, 31, s.mark) : ''}
      ${centreMark(s, c, box, Math.min(box.h * 0.5, 40))}
    </g>
    ${date ? `<g fill="currentColor">${dateBand(c, cx, dateTop, W * (frame === 'oval' ? 0.28 : 0.38), date, k)}</g>` : ''}
    ${bottom ? `<g fill="currentColor" stroke="none">${text(c, cx, dateTop + 40, bottom, W * narrow, 11, 2.2)}</g>` : ''}`;
}

function roundStamp(s, c) {
  const k = s.rule;
  const m = 105;
  const R = s.frame === 'squared' ? 86 : 90;
  const top = U(s.top);
  const date = U(s.date);
  const bottom = U(s.bottom);
  const frameMarkup = s.frame === 'squared'
    ? `<rect x="3" y="3" width="204" height="204" rx="${s.corner}" stroke-width="${4 * k}"/><circle cx="${m}" cy="${m}" r="${R}" stroke-width="${1.4 * k}"/>`
    : `<circle cx="${m}" cy="${m}" r="100" stroke-width="${4 * k}"/><circle cx="${m}" cy="${m}" r="${R}" stroke-width="${1.4 * k}"/>`;

  // With no date the stamp is a seal: the mark sits dead centre and takes the room
  const seal = !date;
  const rTop = seal ? R - 13 : R - 16;
  const rBottom = R - 6;
  // Full circles, so long names never clip at the end of the path; 50% lands at 12 and 6 o'clock
  const arcs = `<path id="at-${c.uid}" d="M ${m} ${m + rTop} A ${rTop} ${rTop} 0 1 1 ${m} ${m - rTop} A ${rTop} ${rTop} 0 1 1 ${m} ${m + rTop}" fill="none" stroke="none"/>
    <path id="ab-${c.uid}" d="M ${m} ${m - rBottom} A ${rBottom} ${rBottom} 0 1 0 ${m} ${m + rBottom} A ${rBottom} ${rBottom} 0 1 0 ${m} ${m - rBottom}" fill="none" stroke="none"/>`;
  const arcText = (id, value, width, size, tracking) =>
    `<text ${fit(value, width, size, tracking, c).attrs} text-anchor="middle"><textPath href="#${id}" startOffset="50%">${esc(value)}</textPath></text>`;
  const topText = top ? arcText(`at-${c.uid}`, top, Math.PI * rTop * (seal ? 0.92 : 0.78), 12.5, 1.8) : '';
  const bottomText = bottom
    ? arcText(`ab-${c.uid}`, bottom, Math.PI * rBottom * (seal ? 0.6 : 0.78), 12, 2.4)
    : star(m, m + rBottom - 4, 5);

  const markWidth = s.centre === 'logo' && c.logo ? 76 : 116;
  const mark = seal
    ? centreMark(s, c, { x: m - 49, y: m - 49, w: 98, h: 98 }, 30)
    : centreMark(s, c, { x: m - markWidth / 2, y: 43, w: markWidth, h: 74 }, 26);

  return `${frameMarkup}${arcs}
    <g fill="currentColor" stroke="none">${topText}${bottomText}${mark}</g>
    ${seal ? '' : `<g fill="currentColor">${dateBand(c, m, 122, 66, date, k)}</g>`}`;
}

// Postmark "killer" bars beside a round date stamp: the duplex
function killerBars(H) {
  const top = H / 2 - (4 * 10 + 3 * 7) / 2;
  return `<g fill="currentColor" stroke="none">${[0, 1, 2, 3].map((i) => `<rect x="220" y="${top + i * 17}" width="76" height="10"/>`).join('')}</g>`;
}

function art(s, c, W, H) {
  if (!isRound(s.frame)) return flatStamp(s, c, W, H);
  return roundStamp(s, c) + (s.frame === 'postmark' ? killerBars(H) : '');
}

export const angle = (s) => s.tilt + s.wobble;

// Paper shown around the stamp when a file includes it
export const PAPER_MARGIN = 30;

// The stamp's footprint once it is tilted, with room for rough edges and a second strike
export function stampBox(s, margin = 0) {
  const { W, H } = frameSize(s);
  const r = (angle(s) * Math.PI) / 180;
  const pad = 12 + margin;
  return {
    w: Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r)) + pad * 2,
    h: Math.abs(W * Math.sin(r)) + Math.abs(H * Math.cos(r)) + pad * 2,
  };
}

/**
 * options.face: { family, weight, scale } · options.measure: width of a string at 1px, in that face
 * options.logo: data URL of a white-on-clear mask · options.fontCSS: @font-face rules to embed
 * options.subScale: how large the second line is, relative to its usual size (the logo sets both lines alike)
 * options.width: pixel width, for a standalone file · options.paper: draw the stamp's paper under it
 */
export function stampSVG(s, { uid = 's', face, measure = estimate, logo = null, fontCSS = '', width = null, paper = false, subScale = 1 } = {}) {
  const rng = mulberry32(s.seed);
  const grainSeed = Math.floor(rng() * 1000);
  const blotchSeed = Math.floor(rng() * 1000);
  const pressureAngle = rng() * 360;
  const strikeX = (rng() * 2 - 1) * 3;
  const strikeY = (rng() * 2 - 1) * 3;

  const { W, H } = frameSize(s);
  const box = stampBox(s, paper ? PAPER_MARGIN : 0);
  const c = { uid, measure, scale: face.scale, logo, subScale };

  // Ink only lands where the rubber meets the paper hard enough. Pressure, a wide dry-patch
  // noise and a fine grain are summed and cut off sharply, so a weak press breaks up into
  // specks the way a real one does instead of fading evenly.
  const reach = 2.2; // how far the noise can push coverage either way
  const cut = 6; // how sharply ink starts and stops
  const dryness = -0.06 + s.voids * 0.4;
  const low = Math.round((1 - s.pressure * 0.48) * 255);
  const size = width ? `width="${width}" height="${Math.round((width * box.h) / box.w)}"` : '';
  const pressed = (markup) => `<g filter="url(#f-${uid})"><g mask="url(#p-${uid})" fill="none" stroke="currentColor">${markup}</g></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${(-box.w / 2).toFixed(2)} ${(-box.h / 2).toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}" aria-hidden="true" focusable="false" style="color:${s.ink}; font-family:'${face.family}','Helvetica Neue',Helvetica,Arial,sans-serif; font-weight:${face.weight}">
    <defs>
      ${fontCSS ? `<style>${fontCSS}</style>` : ''}
      <filter id="f-${uid}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="${grainSeed}" result="wobble"/>
        <feDisplacementMap in="SourceGraphic" in2="wobble" scale="${(s.roughness * 0.55).toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
        <feGaussianBlur stdDeviation="${(s.roughness * 0.13).toFixed(2)}"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="shape"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${grainSeed + 1}" result="fine"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="${blotchSeed}" result="patches"/>
        <feComposite in="fine" in2="patches" operator="arithmetic" k2="0.55" k3="0.45"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="noise"/>
        <feComposite in="shape" in2="noise" operator="arithmetic" k1="${cut * reach}" k2="${cut * (1 - reach / 2)}" k4="${(-cut * (0.5 + dryness)).toFixed(3)}" result="coverage"/>
        <feFlood flood-color="${s.ink}"/>
        <feComposite in2="coverage" operator="in" result="ink"/>
        <feMorphology in="shape" operator="erode" radius="0.8" result="inner"/>
        <feComposite in="shape" in2="inner" operator="out" result="edge"/>
        <feComposite in="ink" in2="edge" operator="in" result="rim"/>
        <feComponentTransfer in="ink" result="body"><feFuncA type="linear" slope="0.84"/></feComponentTransfer>
        <feMerge><feMergeNode in="body"/><feMergeNode in="rim"/></feMerge>
      </filter>
      <linearGradient id="g-${uid}" gradientTransform="rotate(${pressureAngle.toFixed(1)} 0.5 0.5)">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="rgb(${low} ${low} ${low})"/>
      </linearGradient>
      <mask id="p-${uid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}">
        <rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="url(#g-${uid})"/>
      </mask>
    </defs>
    ${paper ? paperMarkup(s.paper, { x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h }, uid, s.paperStrength) : ''}
    <g transform="rotate(${angle(s)}) translate(${-W / 2} ${-H / 2})" opacity="${s.inkOpacity}"${paper ? ' style="mix-blend-mode:multiply"' : ''}>
      ${s.doubleStrike ? `<g transform="translate(${strikeX.toFixed(2)} ${strikeY.toFixed(2)})" opacity="0.2">${pressed(art(s, { ...c, uid: `${uid}-ghost` }, W, H))}</g>` : ''}
      ${pressed(art(s, c, W, H))}
    </g>
  </svg>`;
}
