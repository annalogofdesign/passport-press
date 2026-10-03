// Turns any uploaded logo into one ink: a white-on-clear mask the stamp fills with its colour.
// Everything happens on a canvas in the browser; the file never leaves the device.

const MAX_SIDE = 800;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That file could not be read as an image.'));
  img.src = src;
});

// An SVG with no width or height draws at a browser default size, so give it one from its viewBox
function sizedSVG(source) {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') throw new Error('That SVG could not be read.');
  const viewBox = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    const scale = MAX_SIDE / Math.max(viewBox[2], viewBox[3]);
    svg.setAttribute('width', viewBox[2] * scale);
    svg.setAttribute('height', viewBox[3] * scale);
  }
  return new XMLSerializer().serializeToString(svg);
}

// The upload, flattened to a PNG no larger than MAX_SIDE: small enough to keep between visits
export async function readLogo(file) {
  const isSVG = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!isSVG && !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use an SVG, PNG, JPG or WebP file.');
  const blob = isSVG ? new Blob([sizedSVG(await file.text())], { type: 'image/svg+xml' }) : file;
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight)) || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

async function pixels(src) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// The paper the logo sits on: the colour its corners share, or none if they are clear
function background({ data, width, height }) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map((p) => p * 4);
  if (corners.some((i) => data[i + 3] < 250)) return null;
  return [0, 1, 2].map((ch) => corners.reduce((total, i) => total + data[i + ch], 0) / 4);
}

// How far a pixel is from the background: its opacity on a clear one, its colour distance on a solid one
const apart = (d, i, bg) => (bg
  ? Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) / 255
  : d[i + 3] / 255);

// A first guess at how to read the logo. Most are inked whole. One that is a solid block with
// lighter and darker parts (an app icon, say) is inked by its dark parts so the detail survives.
export async function guessTrace(src) {
  const image = await pixels(src);
  const { data, width, height } = image;
  const bg = background(image);
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (apart(data, i, bg) < 0.3) continue;
      const l = luma(data, i);
      count++;
      sum += l;
      sumSquares += l * l;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const mean = sum / (count || 1);
  const spread = Math.sqrt(Math.max(0, sumSquares / (count || 1) - mean * mean));
  const coverage = count / (((x1 - x0 + 1) * (y1 - y0 + 1)) || 1);
  const block = coverage > 0.7 && spread > 0.12;
  return { logoMode: block ? 'dark' : 'shape', logoThreshold: block ? 0.5 : 0.3, logoInvert: false };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The mask itself, cropped to its ink so the logo fills its slot. Null if nothing would print.
export async function traceLogo(src, { logoMode, logoThreshold, logoInvert }) {
  const image = await pixels(src);
  const { data, width, height } = image;
  const bg = background(image);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] / 255;
      // Dark parts are read as if the logo sat on white paper
      let value = logoMode === 'shape' ? apart(data, i, bg) : 1 - (luma(data, i) * alpha + (1 - alpha));
      if (logoInvert) value = 1 - value;
      const ink = smoothstep(logoThreshold - 0.06, logoThreshold + 0.06, value);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(ink * 255);
      if (ink > 0.05) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = x1 - x0 + 1;
  canvas.height = y1 - y0 + 1;
  canvas.getContext('2d').putImageData(image, -x0, -y0);
  return canvas.toDataURL('image/png');
}
