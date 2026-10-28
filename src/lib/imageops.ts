/**
 * Pure-TS pixel operations replacing macOS `sips`:
 *  - readExifOrientation: JPEG APP1 / WebP EXIF chunk / PNG eXIf chunk
 *  - applyOrientation: bake orientation 1-8 into RGBA pixels
 *  - resizeImage: downscale-only separable Lanczos3 resampler (premultiplied alpha)
 *
 * No child processes, no native deps. AVIF needs no EXIF pass: libavif applies
 * irot/imir transforms itself during wasm decode.
 */
import type { RawImage } from "./codecs.js";

// ---- EXIF orientation read --------------------------------------------------

/**
 * Orientation tag (IFD0 0x0112) from the container's EXIF payload.
 * Returns 1 (upright) when absent, malformed, or out of range.
 */
export function readExifOrientation(b: Uint8Array, fmt: "jpeg" | "png" | "webp" | "avif"): number {
  try {
    if (fmt === "jpeg") return jpegExifOrientation(b);
    if (fmt === "webp") return webpExifOrientation(b);
    if (fmt === "png") return pngExifOrientation(b);
    return 1;
  } catch {
    return 1;
  }
}

/** Orientation from a TIFF header starting at `off` (bounded by `end`). */
function tiffOrientation(b: Uint8Array, off: number, end: number): number {
  if (off + 8 > end) return 1;
  const little = b[off] === 0x49 && b[off + 1] === 0x49;
  const big = b[off] === 0x4d && b[off + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (p: number): number => (little ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
  const u32 = (p: number): number =>
    little
      ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
      : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  const ifd = off + u32(off + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8); // SHORT count 1 → value inline
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

const startsWith = (b: Uint8Array, off: number, s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (b[off + i] !== s.charCodeAt(i)) return false;
  return true;
};

function jpegExifOrientation(b: Uint8Array): number {
  let i = 2; // skip SOI
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1];
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone marker, no length field
      continue;
    }
    const size = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && startsWith(b, i + 4, "Exif\u0000\u0000")) {
      return tiffOrientation(b, i + 10, Math.min(i + 2 + size, b.length));
    }
    if (size < 2) return 1;
    i += 2 + size;
  }
  return 1;
}

function webpExifOrientation(b: Uint8Array): number {
  if (b.length < 12 || !startsWith(b, 0, "RIFF") || !startsWith(b, 8, "WEBP")) return 1;
  let off = 12;
  while (off + 8 <= b.length) {
    const tag = String.fromCharCode(b[off], b[off + 1], b[off + 2], b[off + 3]);
    const size = b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24);
    const payload = off + 8;
    if (payload + size > b.length) return 1;
    if (tag === "EXIF") {
      // Payload is a TIFF header; some writers prefix "Exif\0\0" (spec drift).
      const tiff = startsWith(b, payload, "Exif\u0000\u0000") ? payload + 6 : payload;
      return tiffOrientation(b, tiff, payload + size);
    }
    off = payload + size + (size & 1); // chunks are padded to even
  }
  return 1;
}

function pngExifOrientation(b: Uint8Array): number {
  if (b.length < 8 || !startsWith(b, 0, "\u0089PNG")) return 1;
  let off = 8;
  while (off + 8 <= b.length) {
    const size = ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
    const tag = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
    const payload = off + 8;
    if (payload + size > b.length) return 1;
    if (tag === "eXIf") return tiffOrientation(b, payload, payload + size);
    off = payload + size + 4; // skip CRC
  }
  return 1;
}

// ---- orientation bake -------------------------------------------------------

/** Bake EXIF orientation into pixels. No-op for orientation 1. */
export function applyOrientation(img: RawImage, orientation: number): RawImage {
  if (orientation < 2 || orientation > 8) return img;
  const s = img.data;
  const w = img.width;
  const h = img.height;
  const swap = orientation >= 5;
  const dw = swap ? h : w;
  const dh = swap ? w : h;
  const d = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0, si = 0; y < h; y++) {
    for (let x = 0; x < w; x++, si += 4) {
      let dx: number;
      let dy: number;
      switch (orientation) {
        case 2:
          dx = w - 1 - x;
          dy = y;
          break; // flip H
        case 3:
          dx = w - 1 - x;
          dy = h - 1 - y;
          break; // 180°
        case 4:
          dx = x;
          dy = h - 1 - y;
          break; // flip V
        case 5:
          dx = y;
          dy = x;
          break; // transpose
        case 6:
          dx = h - 1 - y;
          dy = x;
          break; // 90° CW
        case 7:
          dx = h - 1 - y;
          dy = w - 1 - x;
          break; // anti-transpose
        default:
          dx = y;
          dy = w - 1 - x;
          break; // 8: 90° CCW
      }
      const di = (dy * dw + dx) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = s[si + 3];
    }
  }
  return { data: d, width: dw, height: dh };
}

// ---- resize (downscale-only, separable Lanczos3) -----------------------------

const LANCZOS_A = 3;

function lanczos3(x: number): number {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= LANCZOS_A) return 0;
  const px = Math.PI * x;
  return (LANCZOS_A * Math.sin(px) * Math.sin(px / LANCZOS_A)) / (px * px);
}

/** Per-destination-pixel source window + normalised weights (Float32). */
interface Weights {
  start: Int32Array;
  count: Int32Array;
  weight: Float32Array;
  stride: number; // max window size — index stride into `weight`
}

function buildWeights(srcSize: number, dstSize: number): Weights {
  const scale = srcSize / dstSize; // > 1: only downscaling
  const support = LANCZOS_A * scale;
  const stride = Math.min(srcSize, Math.ceil(2 * support) + 2);
  const start = new Int32Array(dstSize);
  const count = new Int32Array(dstSize);
  const weight = new Float32Array(dstSize * stride);
  for (let d = 0; d < dstSize; d++) {
    const center = (d + 0.5) * scale - 0.5;
    const i0 = Math.max(0, Math.floor(center - support));
    const i1 = Math.min(srcSize - 1, Math.ceil(center + support));
    let total = 0;
    let n = 0;
    const base = d * stride;
    for (let i = i0; i <= i1; i++) {
      const wv = lanczos3((i - center) / scale);
      if (wv === 0) continue;
      weight[base + n] = wv;
      total += wv;
      if (n === 0) start[d] = i;
      n++;
    }
    if (total !== 0) for (let k = 0; k < n; k++) weight[base + k] /= total;
    count[d] = n;
  }
  return { start, count, weight, stride };
}

function isOpaque(d: Uint8ClampedArray): boolean {
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return false;
  return true;
}

function premultiply(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    d[i] = (d[i] * a) / 255;
    d[i + 1] = (d[i + 1] * a) / 255;
    d[i + 2] = (d[i + 2] * a) / 255;
  }
}

function unpremultiply(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255 || a === 0) continue;
    d[i] = (d[i] * 255) / a;
    d[i + 1] = (d[i + 1] * 255) / a;
    d[i + 2] = (d[i + 2] * 255) / a;
  }
}

/** Horizontal pass: resample srcW → dstW, row-major in and out. */
function hPass(src: Uint8ClampedArray, srcW: number, srcH: number, dstW: number, wgt: Weights): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * srcH * 4);
  const { start, count, weight, stride } = wgt;
  for (let y = 0; y < srcH; y++) {
    const rowBase = y * srcW * 4;
    const dstBase = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      const base = x * stride;
      const n = count[x];
      const i0 = start[x];
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      for (let k = 0; k < n; k++) {
        const wv = weight[base + k];
        const p = rowBase + (i0 + k) * 4;
        r += src[p] * wv;
        g += src[p + 1] * wv;
        bl += src[p + 2] * wv;
        a += src[p + 3] * wv;
      }
      const q = dstBase + x * 4;
      dst[q] = r;
      dst[q + 1] = g;
      dst[q + 2] = bl;
      dst[q + 3] = a;
    }
  }
  return dst;
}

/** Vertical pass: resample srcH → dstH, row-major in and out. */
function vPass(src: Uint8ClampedArray, srcW: number, srcH: number, dstH: number, wgt: Weights): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(srcW * dstH * 4);
  const { start, count, weight, stride } = wgt;
  const rowStep = srcW * 4; // byte stride between consecutive source rows
  for (let dy = 0; dy < dstH; dy++) {
    const base = dy * stride;
    const n = count[dy];
    const i0 = start[dy];
    const dstBase = dy * srcW * 4;
    for (let x = 0; x < srcW; x++) {
      let p = (i0 * srcW + x) * 4; // first source row, column x
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      for (let k = 0; k < n; k++) {
        const wv = weight[base + k];
        r += src[p] * wv;
        g += src[p + 1] * wv;
        bl += src[p + 2] * wv;
        a += src[p + 3] * wv;
        p += rowStep;
      }
      const q = dstBase + x * 4;
      dst[q] = r;
      dst[q + 1] = g;
      dst[q + 2] = bl;
      dst[q + 3] = a;
    }
  }
  return dst;
}

/**
 * Downscale so the longest side is ≤ maxDim (never upscales, matching the old
 * `sips -Z` semantics). No-op when maxDim is 0 or the image already fits.
 */
export function resizeImage(img: RawImage, maxDim: number): RawImage {
  const w = img.width;
  const h = img.height;
  if (maxDim <= 0 || (w <= maxDim && h <= maxDim)) return img;
  const scale = maxDim / Math.max(w, h); // < 1
  return resizeTo(img, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
}

/**
 * Resample to exactly dw×dh via separable Lanczos3 (premultiplied alpha).
 * Callers must guarantee dw ≤ width and dh ≤ height — buildWeights is
 * tuned for downscaling and this extension never upscales by design.
 */
function resizeTo(img: RawImage, dw: number, dh: number): RawImage {
  const w = img.width;
  const h = img.height;
  if (dw === w && dh === h) return img;

  const opaque = isOpaque(img.data);
  const src = opaque ? img.data : ((d) => (premultiply(d), d))(new Uint8ClampedArray(img.data));

  // Run the bigger reduction first to keep the intermediate buffer small.
  const horizontalFirst = dw * h <= w * dh;
  const out = horizontalFirst
    ? vPass(hPass(src, w, h, dw, buildWeights(w, dw)), dw, h, dh, buildWeights(h, dh))
    : hPass(vPass(src, w, h, dh, buildWeights(h, dh)), w, dh, dw, buildWeights(w, dw));
  if (!opaque) unpremultiply(out);
  return { data: out, width: dw, height: dh };
}

// ---- resize modes (TinyPNG-API semantics, downscale-only) ---------------------

export type ResizeMode = "fit" | "scale" | "cover";

export interface ResizeSpec {
  /** Target width in px; 0 = unconstrained. */
  width: number;
  /** Target height in px; 0 = unconstrained. */
  height: number;
  mode: ResizeMode;
}

export interface ResizeResult {
  image: RawImage;
  /** cover only: true when the source was too small to fill the target and we
   *  degraded to fit (whole image kept, aspect preserved) instead. */
  fellBack: boolean;
}

/** Center-crop to cw×ch (clamped to the source dimensions). */
export function cropCenter(img: RawImage, cw: number, ch: number): RawImage {
  const w = Math.max(1, Math.min(cw, img.width));
  const h = Math.max(1, Math.min(ch, img.height));
  if (w === img.width && h === img.height) return img;
  const x0 = (img.width - w) >> 1;
  const y0 = (img.height - h) >> 1;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * img.width + x0) * 4;
    d.set(img.data.subarray(s, s + w * 4), y * w * 4);
  }
  return { data: d, width: w, height: h };
}

/**
 * Apply a ResizeSpec. Global policy: never upscale (s ≤ 1).
 *  - fit/scale: s = min of the given target ratios, capped at 1 → image fits
 *    inside the box (or along the single given side), aspect preserved.
 *  - cover: s = max of the given ratios; resample then center-crop to the exact
 *    target. When filling would require upscaling, degrade to fit and report
 *    fellBack so the caller can surface it.
 */
export function applyResize(img: RawImage, spec: ResizeSpec): ResizeResult {
  const w = img.width;
  const h = img.height;
  const rw = spec.width > 0 ? spec.width / w : Infinity;
  const rh = spec.height > 0 ? spec.height / h : Infinity;
  if (!isFinite(rw) && !isFinite(rh)) return { image: img, fellBack: false };

  if (spec.mode === "cover") {
    const s = Math.max(isFinite(rw) ? rw : 0, isFinite(rh) ? rh : 0);
    if (s > 1) return { image: fitResize(img, rw, rh), fellBack: true };
    const dw = Math.max(1, Math.round(w * s));
    const dh = Math.max(1, Math.round(h * s));
    const out = resizeTo(img, dw, dh);
    const cw = spec.width > 0 ? Math.min(spec.width, dw) : dw;
    const ch = spec.height > 0 ? Math.min(spec.height, dh) : dh;
    return { image: cropCenter(out, cw, ch), fellBack: false };
  }

  // fit / scale — with a single constrained side both modes coincide here.
  return { image: fitResize(img, rw, rh), fellBack: false };
}

/** Shared fit math: scale = min of finite ratios, capped at 1 (never upscale). */
function fitResize(img: RawImage, rw: number, rh: number): RawImage {
  const s = Math.min(1, Math.min(isFinite(rw) ? rw : Infinity, isFinite(rh) ? rh : Infinity));
  const dw = Math.max(1, Math.round(img.width * s));
  const dh = Math.max(1, Math.round(img.height * s));
  return resizeTo(img, dw, dh);
}
