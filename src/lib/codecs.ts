/**
 * Codec loader: initializes @jsquash (Squoosh) wasm codecs by injecting the
 * wasm bytes read from disk. This bypasses all URL/fetch-based loading, so it
 * survives esbuild bundling inside Raycast.
 *
 * wasm lookup order:
 *   1. <extensionRoot>/node_modules/<pkg>/<rel>      (dev mode, raw)
 *   2. <extensionRoot>/assets/codecs/<pkg>/<rel>.br  (packed, see copy-codecs)
 *   3. <extensionRoot>/assets/codecs/<pkg>/<rel>     (packed by an older build)
 *
 * The packed form is Brotli; it covers 5.9 MB of raw wasm in 1.5 MB, and since
 * codecs initialize lazily only the formats a run touches are ever unpacked.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

// Defensive polyfill: wasm-bindgen codecs construct ImageData on decode.
// Emscripten glues do this too, but only for their own module.
if (typeof globalThis.ImageData === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ImageData = class ImageData {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  };
}

const WASM = {
  jpegDec: ["@jsquash/jpeg", "codec/dec/mozjpeg_dec.wasm"],
  jpegEnc: ["@jsquash/jpeg", "codec/enc/mozjpeg_enc.wasm"],
  pngDec: ["@jsquash/png", "codec/pkg/squoosh_png_bg.wasm"],
  pngEnc: ["@jsquash/png", "codec/pkg/squoosh_png_bg.wasm"],
  oxipng: ["@jsquash/oxipng", "codec/pkg/squoosh_oxipng_bg.wasm"],
  webpEnc: ["@jsquash/webp", "codec/enc/webp_enc.wasm"],
  webpEncSimd: ["@jsquash/webp", "codec/enc/webp_enc_simd.wasm"],
  webpDec: ["@jsquash/webp", "codec/dec/webp_dec.wasm"],
  avifEnc: ["@jsquash/avif", "codec/enc/avif_enc.wasm"],
  avifDec: ["@jsquash/avif", "codec/dec/avif_dec.wasm"],
} as const;

export interface WasmSource {
  path: string;
  /** True when `path` holds Brotli-compressed wasm rather than raw wasm. */
  packed: boolean;
}

function resolveWasm(baseDir: string, entry: readonly [string, string]): WasmSource {
  const [pkg, rel] = entry;
  const candidates: WasmSource[] = [
    { path: join(baseDir, "node_modules", pkg, rel), packed: false },
    { path: join(baseDir, "assets", "codecs", pkg, `${rel}.br`), packed: true },
    { path: join(baseDir, "assets", "codecs", pkg, rel), packed: false },
  ];
  for (const c of candidates) if (existsSync(c.path)) return c;
  throw new Error(`wasm not found: ${pkg}/${rel}`);
}

function readWasm(baseDir: string, entry: readonly [string, string]): Uint8Array<ArrayBuffer> {
  const { path, packed } = resolveWasm(baseDir, entry);
  const raw = packed ? brotliDecompressSync(readFileSync(path)) : readFileSync(path);
  // Copy into a fresh ArrayBuffer: WebAssembly rejects a view over a pooled
  // Buffer's backing store, and brotliDecompressSync returns a plain Buffer.
  const out = new Uint8Array(new ArrayBuffer(raw.byteLength));
  out.set(raw);
  return out;
}

const readWasmModule = (baseDir: string, entry: readonly [string, string]): WebAssembly.Module =>
  new WebAssembly.Module(readWasm(baseDir, entry));

// ---- lazily-initialized codec singletons ----------------------------------

let jpegDecodeP: Promise<(typeof import("@jsquash/jpeg/decode.js"))["default"]> | null = null;
let jpegEncodeP: Promise<(typeof import("@jsquash/jpeg/encode.js"))["default"]> | null = null;
let pngDecodeP: Promise<(typeof import("@jsquash/png/decode.js"))["default"]> | null = null;
let pngEncodeP: Promise<(typeof import("@jsquash/png/encode.js"))["default"]> | null = null;
let oxipngP: Promise<(typeof import("@jsquash/oxipng/optimise.js"))["default"]> | null = null;
let webpEncodeP: Promise<(typeof import("@jsquash/webp/encode.js"))["default"]> | null = null;
let webpDecodeP: Promise<(typeof import("@jsquash/webp/decode.js"))["default"]> | null = null;
let avifEncodeP: Promise<(typeof import("@jsquash/avif/encode.js"))["default"]> | null = null;
let avifDecodeP: Promise<(typeof import("@jsquash/avif/decode.js"))["default"]> | null = null;

async function jpegDecode(baseDir: string) {
  if (!jpegDecodeP) {
    jpegDecodeP = (async () => {
      const m = await import("@jsquash/jpeg/decode.js");
      await m.init(readWasmModule(baseDir, WASM.jpegDec));
      return m.default;
    })();
  }
  return jpegDecodeP;
}

async function jpegEncode(baseDir: string) {
  if (!jpegEncodeP) {
    jpegEncodeP = (async () => {
      const m = await import("@jsquash/jpeg/encode.js");
      await m.init(readWasmModule(baseDir, WASM.jpegEnc));
      return m.default;
    })();
  }
  return jpegEncodeP;
}

async function pngDecode(baseDir: string) {
  if (!pngDecodeP) {
    pngDecodeP = (async () => {
      const m = await import("@jsquash/png/decode.js");
      await m.init(readWasm(baseDir, WASM.pngDec));
      return m.default;
    })();
  }
  return pngDecodeP;
}

async function pngEncode(baseDir: string) {
  if (!pngEncodeP) {
    pngEncodeP = (async () => {
      const m = await import("@jsquash/png/encode.js");
      await m.init(readWasm(baseDir, WASM.pngEnc));
      return m.default;
    })();
  }
  return pngEncodeP;
}

async function oxipng(baseDir: string) {
  if (!oxipngP) {
    oxipngP = (async () => {
      const m = await import("@jsquash/oxipng/optimise.js");
      await m.init(readWasm(baseDir, WASM.oxipng));
      return m.default;
    })();
  }
  return oxipngP;
}

async function webpEncode(baseDir: string) {
  if (!webpEncodeP) {
    webpEncodeP = (async () => {
      const m = await import("@jsquash/webp/encode.js");
      // Match the glue variant jsquash picks internally (simd vs base),
      // otherwise the injected WebAssembly.Module imports won't line up.
      const { simd } = await import("wasm-feature-detect");
      const entry = (await simd()) ? WASM.webpEncSimd : WASM.webpEnc;
      await m.init(readWasmModule(baseDir, entry));
      return m.default;
    })();
  }
  return webpEncodeP;
}

async function webpDecode(baseDir: string) {
  if (!webpDecodeP) {
    webpDecodeP = (async () => {
      const m = await import("@jsquash/webp/decode.js");
      await m.init(readWasmModule(baseDir, WASM.webpDec));
      return m.default;
    })();
  }
  return webpDecodeP;
}

async function avifEncode(baseDir: string) {
  if (!avifEncodeP) {
    avifEncodeP = (async () => {
      const m = await import("@jsquash/avif/encode.js");
      await m.init(readWasmModule(baseDir, WASM.avifEnc));
      return m.default;
    })();
  }
  return avifEncodeP;
}

async function avifDecode(baseDir: string) {
  if (!avifDecodeP) {
    avifDecodeP = (async () => {
      const m = await import("@jsquash/avif/decode.js");
      await m.init(readWasmModule(baseDir, WASM.avifDec));
      return m.default;
    })();
  }
  return avifDecodeP;
}

// ---- public API ------------------------------------------------------------

export type RawImage = { data: Uint8ClampedArray; width: number; height: number };

export async function decodeImage(
  baseDir: string,
  format: "jpeg" | "png" | "webp" | "avif",
  input: ArrayBuffer,
): Promise<RawImage> {
  // Codec .d.ts disagree (ImageData vs RawImage vs nullable); normalize here.
  let img: { data: unknown; width: number; height: number } | RawImage | null;
  switch (format) {
    case "jpeg":
      img = await jpegDecode(baseDir).then((f) => f(input));
      break;
    case "png":
      img = await pngDecode(baseDir).then((f) => f(input));
      break;
    case "webp":
      img = await webpDecode(baseDir).then((f) => f(input));
      break;
    case "avif":
      img = await avifDecode(baseDir).then((f) => f(input));
      break;
  }
  if (!img || !img.data || !img.width || !img.height) throw new Error(`decode failed (${format})`);
  return img as RawImage;
}

export async function encodeImage(
  baseDir: string,
  format: "jpeg" | "webp" | "avif",
  image: RawImage,
  quality: number,
): Promise<ArrayBuffer> {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  switch (format) {
    case "jpeg":
      return jpegEncode(baseDir).then((f) => f(image as never, { quality: q }));
    case "webp":
      return webpEncode(baseDir).then((f) => f(image as never, { quality: q }));
    case "avif":
      return avifEncode(baseDir).then((f) => f(image as never, { quality: q, speed: 6 }));
  }
}

export async function encodePng(baseDir: string, image: RawImage): Promise<ArrayBuffer> {
  return pngEncode(baseDir).then((f) => f(image as never));
}

export async function optimisePng(baseDir: string, input: ArrayBuffer, level = 2): Promise<ArrayBuffer> {
  return oxipng(baseDir).then((f) => f(input, { level }));
}
