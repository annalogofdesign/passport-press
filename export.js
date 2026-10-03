// A stamp as a file: a standalone SVG with its font inside, or that SVG drawn to a PNG.

import { stampSVG, stampBox, PAPER_MARGIN } from './render.js';
import { FACES, embedCSS, measurer } from './fonts.js';

export async function exportSVG(stamp, { logo, width, paper }) {
  const face = FACES[stamp.font];
  return stampSVG(stamp, {
    uid: 'x',
    face,
    measure: measurer(face),
    logo,
    width,
    fontCSS: await embedCSS(face),
    paper,
  });
}

export async function exportPNG(stamp, options) {
  const box = stampBox(stamp, options.paper ? PAPER_MARGIN : 0);
  const height = Math.round((options.width * box.h) / box.w);
  const url = URL.createObjectURL(new Blob([await exportSVG(stamp, options)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, options.width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be drawn.'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
