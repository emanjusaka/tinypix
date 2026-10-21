/**
 * Compression pipeline: jSquash (Squoosh) wasm codecs + pure-TS pixel ops.
 * Inputs: JPEG, PNG, WebP, AVIF only — anything else is rejected at sniff time.
 * No external processes: decode via wasm, EXIF orientation baked in TS,
 * resize via separable Lanczos3 (imageops.ts), encode via wasm.
 *
 * Flow for one input file:
 *  - target format = pref "keep" ? input format : chosen format
 *  - decode to RGBA (mozjpeg / squoosh-png / libwebp / libavif wasm)
 *  - bake EXIF orientation (JPEG APP1, WebP EXIF chunk, PNG eXIf chunk;
 *    AVIF irot/imir is already applied by libavif at decode time)
 *  - downscale to maxDim if needed (never upscales)
 *  - target PNG  : quality < 100 → palette quantization (UPNG, vendored MIT)
 *    → wasm PNG encode → OxiPNG optimise (palette PNGs collapse to indexed
 *    colorType 3 + tRNS); quality = 100 → pure lossless wasm encode
 *    target other: wasm encode at quality (MozJPEG / libwebp / libaom)
 *  - fast path: PNG→PNG with no resize and no orientation tag skips decode
 *    when the output is lossless anyway (quality = 100, or the source is
 *    already palette-limited) and feeds the original bytes to OxiPNG.
 */
import { readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname, basename, extname } from "node:path";
import { decodeImage, encodeImage, encodePng, optimisePng, type RawImage } from "./codecs.js";
import { readExifOrientation, applyOrientation, resizeImage, applyResize, type ResizeSpec } from "./imageops.js";
import { quantizeImage, qualityToColors } from "./quantize.js";

export type TargetFormat = "keep" | "jpeg" | "webp" | "avif" | "png";
export type SniffedFormat = "jpeg" | "png" | "webp" | "avif" | "unsupported";
export type OutputMode = "suffix" | "replace" | "clipboard";

export interface CompressOptions {
  format: TargetFormat;
  quality: number; // 0-100
  maxDim: number; // px, 0 = keep size
  output: OutputMode;
  /** Exact-size resize (Resize Images command). Takes precedence over maxDim. */
  resize?: ResizeSpec;
}

export interface FileResult {
  input: string;
  output?: string;
  inBytes: number;
  outBytes: number;
  skipped?: string;
  error?: string;
  /** Final pixel dimensions when a ResizeSpec was applied. */
  outW?: number;
  outH?: number;
  /** cover-mode sources too small to fill the target were kept whole (fit). */
  fellBack?: boolean;
}

const EXT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp", avif: "avif" };

/** Magic-byte sniffing — extensions lie. */
export function sniffFormat(b: Uint8Array): SniffedFormat {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return "unsupported";
}

const abOf = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;

/**
 * Human-readable reason for a source we cannot decode. Magic bytes identify the
 * actual container, which is far more useful than "unsupported format" — HEIC
 * and GIF are the two macOS users hit most.
 */
function describeUnsupported(b: Uint8Array): string {
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(...b.slice(8, 12)).replace(/\0/g, "");
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "HEIC/HEIF not supported — export as JPEG first (Photos → Export, or `sips -s format jpeg`)";
    }
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "GIF not supported — convert to PNG/WebP first";
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)) {
    return "TIFF not supported — convert to JPEG/PNG first";
  }
  if (b[0] === 0x42 && b[1] === 0x4d) return "BMP not supported — convert to PNG first";
  return "unsupported image format (JPEG/PNG/WebP/AVIF only)";
}

/**
 * CMYK / YCCK JPEGs (4 components) make the MozJPEG wasm decoder abort with an
 * opaque Emscripten ExitStatus, so detect them up front and explain the fix.
 */
function jpegHasFourComponents(b: Uint8Array): boolean {
  let i = 2; // skip SOI
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return false;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return b[i + 9] === 4; // precision(1) height(2) width(2) components(1) → offset 9
    i += 2 + len;
  }
  return false;
}

/** Emscripten rejects with plain objects (ExitStatus); keep the useful text. */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  const s = String(err);
  return s === "[object Object]" ? "unknown decoder error" : s;
}

/**
 * True when a PNG is inherently limited to ≤256 colors (indexed, or 8-bit-or-
 * less grayscale) — palette quantization cannot improve it, so such inputs
 * keep the lossless fast path even with quality < 100.
 */
function pngPaletteLimited(b: Uint8Array): boolean {
  // IHDR must be the first chunk: signature(8) + length(4) + "IHDR" → byte 24 = depth, 25 = colorType
  if (b.length < 26) return false;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return false; // "IHDR"
  const depth = b[24];
  const colorType = b[25];
  if (colorType === 3) return true; // indexed ≤ 256 entries by definition
  if ((colorType === 0 || colorType === 4) && depth <= 8) return true; // gray ≤ 256 levels
  return false;
}

function outputFor(input: string, targetExt: string, mode: OutputMode, tmpDir: string, suffix = "min"): { path: string; replace: boolean } {
  const dir = dirname(input);
  const base = basename(input, extname(input));
  if (mode === "clipboard") return { path: join(tmpDir, `${base}-${suffix}-${randomUUID()}.${targetExt}`), replace: false };
  if (mode === "replace") {
    const sameExt = extname(input).slice(1).toLowerCase() === targetExt ||
      (targetExt === "jpg" && extname(input).slice(1).toLowerCase() === "jpeg");
    return sameExt ? { path: input, replace: true } : { path: join(dir, `${base}.${targetExt}`), replace: false };
  }
  return { path: join(dir, `${base}-${suffix}.${targetExt}`), replace: false };
}

export async function compressFile(
  input: string,
  opts: CompressOptions,
  ctx: { baseDir: string; tmpDir: string },
): Promise<FileResult> {
  const res: FileResult = { input, inBytes: 0, outBytes: 0 };
  try {
    const inBuf = await readFile(input);
    res.inBytes = inBuf.length;
    const fmt = sniffFormat(inBuf.subarray(0, Math.min(64, inBuf.length)));
    if (fmt === "unsupported") throw new Error(describeUnsupported(inBuf));
    if (fmt === "jpeg" && jpegHasFourComponents(inBuf)) {
      throw new Error("CMYK JPEG not supported — re-save as RGB/sRGB first (Photoshop → Mode → RGB, or export from the original)");
    }

    const target: Exclude<TargetFormat, "keep"> =
      opts.format !== "keep"
        ? opts.format
        : fmt === "png" || fmt === "webp" || fmt === "avif"
          ? (fmt as "png" | "webp" | "avif")
          : "jpeg";
    const targetExt = EXT[target];

    const orientation = readExifOrientation(inBuf, fmt);
    const spec = opts.resize;
    const resizing = !!spec && (spec.width > 0 || spec.height > 0);
    let fellBack = false;

    let outBuf: Buffer;
    let outW: number | undefined;
    let outH: number | undefined;
    // Lossy PNG path only makes sense when the pixels can actually gain from
    // palette reduction; palette-limited sources stay on the lossless fast path.
    const pngFastPath =
      target === "png" &&
      fmt === "png" &&
      !resizing &&
      opts.maxDim === 0 &&
      orientation === 1 &&
      (opts.quality >= 100 || pngPaletteLimited(inBuf.subarray(0, Math.min(64, inBuf.length))));
    if (pngFastPath) {
      // Fast path: pixels untouched, pure lossless optimisation.
      outBuf = Buffer.from(await optimisePng(ctx.baseDir, abOf(inBuf), 2));
    } else {
      let image: RawImage = await decodeImage(ctx.baseDir, fmt, abOf(inBuf));
      if (orientation > 1) image = applyOrientation(image, orientation);
      if (resizing && spec) {
        const r = applyResize(image, spec);
        image = r.image;
        fellBack = r.fellBack;
        outW = image.width;
        outH = image.height;
      } else if (opts.maxDim > 0) {
        image = resizeImage(image, opts.maxDim);
        outW = image.width;
        outH = image.height;
      }
      if (target === "png") {
        if (opts.quality < 100) {
          image = quantizeImage(image, qualityToColors(opts.quality), 0);
        }
        const png = await encodePng(ctx.baseDir, image);
        outBuf = Buffer.from(await optimisePng(ctx.baseDir, png, 2));
      } else {
        outBuf = Buffer.from(await encodeImage(ctx.baseDir, target, image, opts.quality));
      }
    }

    const suffix = resizing ? `${outW}x${outH}` : "min";
    const { path: outPath, replace } = outputFor(input, targetExt, opts.output, ctx.tmpDir, suffix);
    if (opts.output === "replace" && !resizing && outBuf.length >= res.inBytes) {
      res.skipped = `no gain (${fmtKB(res.inBytes)} → ${fmtKB(outBuf.length)})`;
      return res;
    }
    await writeFile(outPath, outBuf);
    if (replace) {
      // same path: nothing to clean up
    } else if (opts.output === "replace") {
      await rm(input, { force: true }); // format changed: new file replaces old
    }
    res.output = outPath;
    res.outBytes = outBuf.length;
    if (resizing) {
      res.outW = outW;
      res.outH = outH;
      res.fellBack = fellBack;
    }
    return res;
  } catch (err) {
    res.error = errText(err);
    return res;
  }
}

export function fmtKB(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function fmtPercent(before: number, after: number): string {
  if (before === 0) return "0%";
  return `${after <= before ? "-" : "+"}${Math.abs(Math.round((1 - after / before) * 100))}%`;
}
