# Passport Press

Turns a name, a phrase or a logo into a passport stamp, in the style of the stamps on
Anna Skopenko's portfolio. Plain HTML, CSS and ES modules: no build step, no server, no accounts.
Everything runs in the browser, and an uploaded logo never leaves the device.

## Run it

```bash
python3 -m http.server 4322 --bind 127.0.0.1
```

Then open http://localhost:4322. Any static server works.

## Host it

The folder is the site. Upload it as it is to any static host (Netlify, Vercel, Cloudflare Pages,
GitHub Pages). There is nothing to build or configure.

## What's here

```
index.html   the page: stage on the left, settings on the right
styles.css   tokens, layout, controls
app.js       the editor: state, form, saving, share links
render.js    pure stamp renderer: stamp in, SVG out (seven shapes, ink texture)
fonts.js     the four typefaces: loading, measuring, embedding in exports
fonts/       the font files and their licences
paper.js     the papers a stamp can sit on
logo.js      turns an SVG, PNG or JPG into one ink colour
export.js    SVG and PNG files
examples.js  the ready-made stamps behind "Surprise me" (the first is what a new visitor sees)
_render-assets.html  renders og.jpg and icon.png from the app's own stamps (not published)
sound.js     the thud, synthesised; the same sound as the portfolio's stamps
```

`render.js` started as a copy of `site/stamp-render.js` in the portfolio and is now separate,
so the portfolio can change without breaking this.

## Good to know

- **Typefaces** are Inter Tight, Barlow Condensed, Courier Prime and Zilla Slab, all under the SIL
  Open Font License and self-hosted in `fonts/`, each with its licence text. Only Latin is included,
  so other scripts fall back to a system font.
- **Paper.** Six papers (passport, cotton, plain, aged, kraft, grid) drawn as SVG by `paper.js`, with
  a strength setting that fades the paper towards plain. The same markup is used on screen and in a
  file, so they match. A PNG that includes a textured paper is large (about 5 MB at 1600 px).
- **Pressing.** Clicking the stamp re-inks it and lands it a few degrees either side of the Tilt
  setting. A wooden stamp comes down, the ink appears on impact with a thud, and it lifts away.
  First visit in a session plays it once without sound (browsers block sound before a click).
  Sound can be turned off in the top bar; reduced-motion users get the change without the animation.
- **Exports.** The PNG is the dependable one. The SVG carries its typeface inside and looks right in
  browsers, but design tools such as Figma ignore SVG filters, so the ink texture is lost there.
- **Share links** hold the words and settings in the URL. A logo is not included.
- **The stamp is remembered** in the browser's local storage between visits.
