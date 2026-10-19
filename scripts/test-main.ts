/**
 * Test entry (bundled by esbuild, mirroring the Raycast build path).
 * Usage: node bundle.mjs <extDir> <tmpDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { compressFile, sniffFormat, fmtKB, fmtPercent, type FileResult, type CompressOptions } from "../src/lib/pipeline.js";
import { decodeImage } from "../src/lib/codecs.js";
import type { ResizeSpec } from "../src/lib/imageops.js";

const extDir = process.env.EXT_DIR ?? process.argv[2] ?? new URL("../../", import.meta.url).pathname;
const workDir = join(extDir, ".test", "work", `run-${randomUUID()}`);
mkdirSync(workDir, { recursive: true });
const tmpDir = join(workDir, "tmp");
mkdirSync(tmpDir, { recursive: true });
const src = (c: { srcFile: string; as: string }) =>
  writeFileSync(join(workDir, c.as), readFileSync(`/tmp/e2e-src/${c.srcFile}`));

interface Case {
  name: string;
  srcFile: string;
  as: string;
  opts: Omit<CompressOptions, "resize"> & { resize?: ResizeSpec };
}

const cases: Case[] = [
  { name: "jpg keep + resize 1080 + q75", srcFile: "photo.jpg", as: "a.jpg", opts: { format: "keep", quality: 75, maxDim: 1080, output: "suffix" } },
  { name: "jpg → webp + resize 1600", srcFile: "photo.jpg", as: "b.jpg", opts: { format: "webp", quality: 80, maxDim: 1600, output: "suffix" } },
  { name: "jpg → avif q60", srcFile: "photo.jpg", as: "c.jpg", opts: { format: "avif", quality: 60, maxDim: 0, output: "suffix" } },
  { name: "png keep q75 no resize (quantize)", srcFile: "photo.png", as: "d.png", opts: { format: "keep", quality: 75, maxDim: 0, output: "suffix" } },
  { name: "png keep q100 no resize (lossless)", srcFile: "photo.png", as: "d100.png", opts: { format: "keep", quality: 100, maxDim: 0, output: "suffix" } },
  { name: "png indexed src q75 (palette fast path)", srcFile: "photo-pal.png", as: "dpal.png", opts: { format: "keep", quality: 75, maxDim: 0, output: "suffix" } },
  { name: "png keep q50 + resize 800 (quantize)", srcFile: "photo.png", as: "e.png", opts: { format: "keep", quality: 50, maxDim: 800, output: "suffix" } },
  { name: "jpg exif-rot6 keep + resize 1080", srcFile: "photo-rot6.jpg", as: "k.jpg", opts: { format: "keep", quality: 75, maxDim: 1080, output: "suffix" } },
  { name: "png → jpeg + resize", srcFile: "photo.png", as: "f.png", opts: { format: "jpeg", quality: 85, maxDim: 1200, output: "suffix" } },
  { name: "replace mode same ext", srcFile: "photo.jpg", as: "i.jpg", opts: { format: "keep", quality: 50, maxDim: 900, output: "replace" } },
  { name: "clipboard mode writes tmp", srcFile: "photo.jpg", as: "j.jpg", opts: { format: "webp", quality: 75, maxDim: 0, output: "clipboard" } },
  // ResizeSpec cases (photo.jpg = 3000x2000 upright, photo-rot6.jpg = 2000x3000 after orientation bake)
  { name: "resize cover 1080x1440 (crop)", srcFile: "photo.jpg", as: "r1.jpg", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 1080, height: 1440, mode: "cover" } } },
  { name: "resize fit 1200x630 (no crop)", srcFile: "photo.jpg", as: "r2.jpg", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 1200, height: 630, mode: "fit" } } },
  { name: "resize scale w1600", srcFile: "photo.jpg", as: "r3.jpg", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 1600, height: 0, mode: "scale" } } },
  { name: "resize cover 4000x3000 → fit fallback", srcFile: "photo.jpg", as: "r4.jpg", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 4000, height: 3000, mode: "cover" } } },
  { name: "resize rot6 cover 1080x1440", srcFile: "photo-rot6.jpg", as: "r5.jpg", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 1080, height: 1440, mode: "cover" } } },
  { name: "resize png fit 1080x1440 → oxipng", srcFile: "photo.png", as: "r6.png", opts: { format: "keep", quality: 90, maxDim: 0, output: "suffix", resize: { width: 1080, height: 1440, mode: "fit" } } },
];

const results: Record<string, FileResult> = {};

let pass = 0;
let fail = 0;
for (const c of cases) {
  const input = join(workDir, c.as);
  src(c);
  const t0 = Date.now();
  try {
    const r = await compressFile(input, c.opts, { baseDir: extDir, tmpDir });
    results[c.name] = r;
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.error) {
      console.log(`✗ ${c.name} — ERROR: ${r.error}`);
      fail++;
    } else if (r.skipped) {
      console.log(`↷ ${c.name} — skipped: ${r.skipped}`);
      pass++;
    } else {
      const outName = r.output?.split("/").pop();
      console.log(`✓ ${c.name} — ${fmtKB(r.inBytes)} → ${fmtKB(r.outBytes)} (${fmtPercent(r.inBytes, r.outBytes)}) → ${outName} [${dt}s]`);
      pass++;
    }
  } catch (e) {
    console.log(`✗ ${c.name} — THREW: ${e instanceof Error ? e.message : e}`);
    fail++;
  }
}

// dimension assertions: resize output + EXIF orientation bake (rot6: 3000x2000
// tagged 6 → upright 2000x3000 → maxDim 1080 ⇒ 720x1080 portrait)
async function dimsOf(file: string): Promise<[number, number]> {
  const b = readFileSync(file);
  const fmt = sniffFormat(new Uint8Array(b, 0, Math.min(64, b.length)));
  const img = await decodeImage(extDir, fmt, b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
  return [img.width, img.height];
}
for (const [file, ew, eh] of [["a-min.jpg", 1080, 720], ["k-min.jpg", 720, 1080]] as const) {
  const [w, h] = await dimsOf(join(workDir, file));
  const ok = w === ew && h === eh;
  console.log(`${ok ? "✓" : "✗"} dims ${file} = ${w}x${h} (expect ${ew}x${eh})`);
  if (!ok) fail++;
}

// ResizeSpec assertions: exact dims per mode + dims-suffixed filenames + fallback flag.
// photo.jpg 3000x2000: cover 1080x1440 → 2160x1440 crop 1080x1440; fit 1200x630 → 945x630;
// scale w1600 → 1600x1067; cover 4000x3000 would upscale → fallback, dims stay 3000x2000.
// photo-rot6.jpg upright 2000x3000: cover 1080x1440 → 1080x1620 crop 1080x1440.
const resizeExpect: [string, string, number, number][] = [
  ["resize cover 1080x1440 (crop)", "r1-1080x1440.jpg", 1080, 1440],
  ["resize fit 1200x630 (no crop)", "r2-945x630.jpg", 945, 630],
  ["resize scale w1600", "r3-1600x1067.jpg", 1600, 1067],
  ["resize cover 4000x3000 → fit fallback", "r4-3000x2000.jpg", 3000, 2000],
  ["resize rot6 cover 1080x1440", "r5-1080x1440.jpg", 1080, 1440],
  ["resize png fit 1080x1440 → oxipng", "r6-1080x720.png", 1080, 720],
];
for (const [caseName, outFile, ew, eh] of resizeExpect) {
  const r = results[caseName];
  const [w, h] = r.output ? await dimsOf(r.output) : [0, 0];
  const nameOk = r.output?.split("/").pop() === outFile;
  const dimsOk = w === ew && h === eh;
  console.log(`${nameOk && dimsOk ? "✓" : "✗"} resize ${caseName}: ${r.output?.split("/").pop()} ${w}x${h} (expect ${outFile} ${ew}x${eh})`);
  if (!nameOk || !dimsOk) fail++;
}
{
  const fb = results["resize cover 4000x3000 → fit fallback"];
  const ok = !!fb?.fellBack && !results["resize cover 1080x1440 (crop)"]?.fellBack;
  console.log(`${ok ? "✓" : "✗"} cover→fit fallback flag (fellBack=${fb?.fellBack})`);
  if (!ok) fail++;
}

// sniff sanity (webp/avif reuse outputs of cases b and c)
const sniffCases: [string, string][] = [
  ["jpg", "jpeg"], ["png", "png"], ["webp", "webp"], ["avif", "avif"],
];
for (const [f, expect] of sniffCases) {
  const b = readFileSync(join(workDir, { jpg: "a.jpg", png: "d.png", webp: "b-min.webp", avif: "c-min.avif" }[f] as string));
  const got = sniffFormat(new Uint8Array(b, 0, Math.min(64, b.length)));
  console.log(`${got === expect ? "✓" : "✗"} sniff ${f} = ${got} (expect ${expect})`);
  if (got !== expect) fail++;
}

// PNG quantization assertions: IHDR colorType at byte 25.
// q<100 on a truecolor source → indexed output (3); q100 → truecolor stays 2;
// an already-indexed source keeps the lossless fast path (stays 3).
{
  const ct = (f: string) => new Uint8Array(readFileSync(join(workDir, f)))[25];
  const checks: [string, string, number][] = [
    ["png keep q75 no resize (quantize)", "d-min.png", 3],
    ["png keep q100 no resize (lossless)", "d100-min.png", 2],
    ["png indexed src q75 (palette fast path)", "dpal-min.png", 3],
    ["png keep q50 + resize 800 (quantize)", "e-min.png", 3],
  ];
  for (const [caseName, outFile, expectCt] of checks) {
    const r = results[caseName];
    const got = r.output ? ct(r.output.split("/").pop()!) : -1;
    const ok = got === expectCt;
    console.log(`${ok ? "✓" : "✗"} colorType ${caseName}: ${got} (expect ${expectCt})`);
    if (!ok) fail++;
  }
  // lossy PNG must actually be smaller than the lossless one here
  const lossy = results["png keep q75 no resize (quantize)"]?.outBytes ?? 0;
  const lossless = results["png keep q100 no resize (lossless)"]?.outBytes ?? 1;
  const ok = lossy < lossless;
  console.log(`${ok ? "✓" : "✗"} quantized < lossless (${lossy} < ${lossless})`);
  if (!ok) fail++;
}

// unsupported input must be rejected with a clear error
{
  const txt = join(workDir, "not-image.txt");
  writeFileSync(txt, "definitely not an image");
  const r = await compressFile(txt, { format: "keep", quality: 75, maxDim: 0, output: "suffix" }, { baseDir: extDir, tmpDir });
  const ok = !!r.error && /unsupported/.test(r.error);
  console.log(`${ok ? "✓" : "✗"} rejects non-image input (${r.error ?? "no error"})`);
  if (!ok) fail++;
}

console.log(`\n${fail === 0 ? "ALL PASSED ✅" : "FAILURES ❌"} — ${pass} passed, ${fail} failed`);
console.log("workdir:", workDir);
process.exit(fail === 0 ? 0 : 1);
