/**
 * Lossy PNG palette quantization on top of vendored UPNG.js (MIT):
 *  - KD-tree palette generation (+ k-means refinement inside UPNG.quantize)
 *  - optional Floyd–Steinberg (or ordered) dithering via UPNG.encode.dither
 *
 * The result is RGBA where every pixel carries an exact palette color, so the
 * downstream @jsquash PNG encoder + OxiPNG pass collapse it into an indexed
 * (colorType 3 + tRNS) PNG with reduced bit depth — no custom PNG writer.
 *
 * quality semantics for PNG: 100 keeps the lossless pipeline; every value
 * below maps linearly to a palette size (2..256 colors).
 */
import UPNG from "./vendor/upng.js";
import type { RawImage } from "./codecs.js";

/** Narrow typed view of the vendored module (its exports are attached by mutation). */
interface UPNGModule {
  quantize(
    abuf: ArrayBuffer,
    ps: number,
    doKmeans?: boolean,
  ): {
    abuf: ArrayBuffer;
    inds: Uint8Array;
    plte: { est: { rgba: number } }[];
  };
  encode: {
    dither(sb: Uint8Array, w: number, h: number, plte: number[], tb: Uint8Array, oind: Uint8Array, mtd?: number): void;
  };
}
const upng = UPNG as unknown as UPNGModule;

export type DitherMode = 0 | 1 | 2; // 0 = none, 1 = Floyd–Steinberg, 2 = ordered 4×4

/** quality (0-100) → palette size (2-256). Callers treat 100 as "lossless". */
export function qualityToColors(quality: number): number {
  const q = Math.max(1, Math.min(99, Math.round(quality)));
  return Math.max(2, Math.min(256, Math.round((q * 256) / 100)));
}

/**
 * Quantize an RGBA image to at most `maxColors` distinct colors.
 * Dithering (mode 1) trades gradient banding for noise, usually matching the
 * visual quality of pngquant/TinyPNG output.
 */
export function quantizeImage(image: RawImage, maxColors: number, ditherMode: DitherMode = 1): RawImage {
  const K = Math.max(2, Math.min(256, Math.round(maxColors)));
  const { width, height, data } = image;
  const pixels = width * height;

  // UPNG.quantize expects one standalone ArrayBuffer of RGBA bytes.
  const abuf = (
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.slice().buffer
  ) as ArrayBuffer;

  const qres = upng.quantize(abuf, K);
  if (ditherMode === 0 || pixels === 0) {
    return { data: new Uint8ClampedArray(qres.abuf), width, height };
  }

  const plte: number[] = [];
  for (const leaf of qres.plte) plte.push(leaf.est.rgba);

  const sb = new Uint8Array(abuf);
  const tb = new Uint8Array(pixels * 4);
  const inds = new Uint8Array(pixels);
  upng.encode.dither(sb, width, height, plte, tb, inds, ditherMode);
  return { data: new Uint8ClampedArray(tb.buffer), width, height };
}
