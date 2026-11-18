// Small helpers for working with <canvas>.

const imageCache = new Map();

/** Loads an image URL and resolves with the <img> once it's ready to draw. Cached. */
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    // "anonymous" lets us export canvases that contain images from other sites
    // (like the 7TV CDN) as long as that site allows it (CORS).
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(src);
      reject(new Error(`Could not load image: ${src}`));
    };
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

/** Turns a File the user picked into an <img>. */
export function loadFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img); // keep the object URL alive while the image is in use
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/** Saves a canvas as a PNG download. PNG keeps transparency. */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) {
      alert('Export failed. If you used an emote from another site, it may block exporting.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/** Adds a rounded-rectangle path (doesn't fill or stroke it). */
export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const trimCache = new WeakMap();
/**
 * Returns a canvas with the image's empty transparent border cut off,
 * so icons can be sized by their visible pixels. Cached per image.
 */
export function trimTransparent(img) {
  if (trimCache.has(img)) return trimCache.get(img);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  let out = c;
  if (maxX >= 0) {
    out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  }
  trimCache.set(img, out);
  return out;
}

/** Makes a filename-safe slug, e.g. "My Clip!" -> "my-clip". */
export function slug(s, fallback = 'image') {
  const out = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
}

/** Waits until the given web fonts are loaded so canvas text uses them. */
export async function ensureFonts(specs) {
  if (!document.fonts) return;
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {})));
}
