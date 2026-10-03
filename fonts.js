// The typefaces a stamp can be set in. All four are under the SIL Open Font License,
// so they can ship in a public tool and be embedded in what people export.
// The files and their licences are in fonts/. `scale` evens out their apparent size;
// narrow faces are set larger.

export const FACES = {
  grotesk: { label: 'Grotesk', family: 'Inter Tight', weight: 700, range: '100 900', scale: 1, url: 'fonts/inter-tight-latin-wght.woff2' },
  condensed: { label: 'Condensed', family: 'Barlow Condensed', weight: 600, scale: 1.3, url: 'fonts/barlow-condensed-latin-600.woff2' },
  mono: { label: 'Typewriter', family: 'Courier Prime', weight: 700, scale: 1, url: 'fonts/courier-prime-latin-700.woff2' },
  slab: { label: 'Slab', family: 'Zilla Slab', weight: 700, scale: 1.08, url: 'fonts/zilla-slab-latin-700.woff2' },
};

const widths = new Map();

// Resolves as each face arrives, so the stamp can refit its text to real metrics
export function loadFaces(onLoad) {
  return Promise.allSettled(Object.values(FACES).map(async (face) => {
    const font = new FontFace(face.family, `url(${face.url}) format("woff2")`, { weight: face.range || String(face.weight) });
    document.fonts.add(await font.load());
    widths.clear();
    onLoad();
  }));
}

const ctx = document.createElement('canvas').getContext('2d');

// Width of a string at 1px in this face, for fitting text to a stamp
export function measurer(face) {
  return (value) => {
    const key = `${face.family}:${value}`;
    if (!widths.has(key)) {
      ctx.font = `${face.weight} 100px "${face.family}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
      widths.set(key, ctx.measureText(value).width / 100);
    }
    return widths.get(key);
  };
}

const embedded = new Map();

// An exported file can't reach the network for its font, so the font travels inside it
export async function embedCSS(face) {
  if (!embedded.has(face.family)) {
    const bytes = new Uint8Array(await (await fetch(face.url)).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    embedded.set(face.family, `@font-face{font-family:"${face.family}";font-weight:${face.range || face.weight};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2")}`);
  }
  return embedded.get(face.family);
}
