// The paper a stamp lands on, as SVG in the stamp's own units, so the page on screen
// and the page in an exported file carry the same texture at the same scale.

export const PAPERS = [
  ['passport', 'Passport'],
  ['cotton', 'Cotton'],
  ['plain', 'Plain'],
  ['aged', 'Aged'],
  ['kraft', 'Kraft'],
  ['grid', 'Grid'],
];

const BASE = {
  passport: '#f6f2e6',
  cotton: '#f8f5ec',
  plain: '#fbf8f0',
  aged: '#efe3c8',
  kraft: '#c8a87e',
  grid: '#f8f6ee',
};

// A layer of noise laid down as a tint: where the noise runs high, the colour shows.
// Colour-matrix noise, not lighting, so it looks the same at any export size.
const tint = ([r, g, b], freq, octaves, seed, slope, lift) => (name) =>
  `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>
   <feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${slope} ${lift}" result="${name}"/>`;

const SHADE = [0.3, 0.24, 0.16];
const LIGHT = [1, 1, 1];

const grain = (strength = 1) => tint(SHADE, 1.3, 3, 4, 1.1 * strength, -0.46 * strength);
const flecks = (strength = 1) => tint(LIGHT, 1.1, 2, 9, 1.6 * strength, -0.84 * strength);

const BROWN = [0.5, 0.33, 0.12];
const FIBRE = [0.25, 0.16, 0.08];

const TEXTURE = {
  passport: [grain(0.6)],
  cotton: [tint(SHADE, 0.35, 3, 12, 0.5, -0.2), grain(0.8), flecks(0.8)],
  plain: [],
  aged: [tint(BROWN, 0.006, 2, 21, 1, -0.42), tint(BROWN, 0.05, 2, 5, 0.3, -0.13), grain(1)],
  // Fibres all run one way, as they do off a paper machine
  kraft: [grain(1.3), tint(FIBRE, '0.012 0.9', 2, 31, 0.6, -0.24), tint([1, 0.93, 0.8], '0.02 1.2', 2, 17, 0.7, -0.31), tint(FIBRE, 0.5, 1, 40, 2.4, -1.5)],
  grid: [grain(0.6)],
};

function texture(kind, area, uid) {
  const layers = TEXTURE[kind];
  if (!layers.length) return '';
  return `<filter id="pt-${uid}" filterUnits="userSpaceOnUse" ${area} color-interpolation-filters="sRGB">
      ${layers.map((layer, i) => layer(`n${i}`)).join('')}
      <feMerge>${layers.map((_, i) => `<feMergeNode in="n${i}"/>`).join('')}</feMerge>
    </filter>
    <rect ${area} filter="url(#pt-${uid})"/>`;
}

const wave = (width, mid, amplitude, phase) => `M${Array.from({ length: 21 }, (_, i) => {
  const x = (i / 20) * width;
  return `${x.toFixed(1)} ${(mid + amplitude * Math.sin((x / width) * 2 * Math.PI + phase)).toFixed(2)}`;
}).join('L')}`;

// Lobed rings a quarter-turn of a lobe apart: the engraved rosette of a banknote or visa page
function rosette(cx, cy, radius, lobes, depth, rings) {
  return Array.from({ length: rings }, (_, k) => {
    const phase = (k * 2 * Math.PI) / rings;
    const points = Array.from({ length: 240 }, (_, i) => {
      const a = (i / 240) * 2 * Math.PI;
      const r = radius * (1 + depth * Math.cos(lobes * a + phase));
      return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    });
    return `<path d="M${points.join('L')}Z"/>`;
  }).join('');
}

// Security printing: braided ribbons in two pale inks, a colour wash, and a rosette behind the stamp
function passport(area, uid, { x, y, w, h }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `<linearGradient id="pw-${uid}" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f0d9d2"/><stop offset="0.5" stop-color="#f1ecd9"/><stop offset="1" stop-color="#d5e6e1"/>
    </linearGradient>
    <pattern id="pa-${uid}" width="44" height="13" patternUnits="userSpaceOnUse">
      <path d="${[0, 1, 2, 3].map((j) => wave(44, 6.5, 3.6, (j * Math.PI) / 2)).join('')}" fill="none" stroke="#5f9c94" stroke-width="0.3"/>
    </pattern>
    <pattern id="pb-${uid}" width="30" height="13" patternUnits="userSpaceOnUse" patternTransform="translate(0 6.5)">
      <path d="${[0, 1].map((j) => wave(30, 6.5, 2.2, j * Math.PI)).join('')}" fill="none" stroke="#c4847c" stroke-width="0.3"/>
    </pattern>
    <rect ${area} fill="url(#pw-${uid})" opacity="0.7"/>
    <rect ${area} fill="url(#pa-${uid})" opacity="0.5"/>
    <rect ${area} fill="url(#pb-${uid})" opacity="0.45"/>
    <g fill="none" stroke="#5f9c94" stroke-width="0.3" opacity="0.5">
      ${rosette(cx, cy, 128, 16, 0.1, 8)}${rosette(cx, cy, 64, 10, 0.16, 6)}
    </g>`;
}

function grid(area, uid) {
  return `<pattern id="pg-${uid}" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M10 0V50M20 0V50M30 0V50M40 0V50M0 10H50M0 20H50M0 30H50M0 40H50" fill="none" stroke="#7fa6c9" stroke-width="0.25" opacity="0.55"/>
      <path d="M0 0V50M0 0H50" fill="none" stroke="#7fa6c9" stroke-width="0.6" opacity="0.7"/>
    </pattern>
    <rect ${area} fill="url(#pg-${uid})"/>`;
}

// Old paper darkens from its edges in
function vignette(area, uid) {
  return `<radialGradient id="pv-${uid}" r="0.75">
      <stop offset="0.45" stop-color="#7a5320" stop-opacity="0"/><stop offset="1" stop-color="#7a5320" stop-opacity="0.3"/>
    </radialGradient>
    <rect ${area} fill="url(#pv-${uid})"/>`;
}

/**
 * The paper for the rectangle (x, y, w, h), in the units of whatever SVG it goes in.
 * `strength` fades the whole paper, colour and texture, towards plain.
 */
export function paperMarkup(kind, box, uid, strength = 1) {
  const area = `x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}"`;
  return `<clipPath id="pc-${uid}"><rect ${area}/></clipPath>
    <rect ${area} fill="${BASE.plain}"/>
    <g clip-path="url(#pc-${uid})" opacity="${strength}">
      <rect ${area} fill="${BASE[kind]}"/>
      ${kind === 'passport' ? passport(area, uid, box) : ''}
      ${kind === 'grid' ? grid(area, uid) : ''}
      ${texture(kind, area, uid)}
      ${kind === 'aged' ? vignette(area, uid) : ''}
    </g>`;
}
