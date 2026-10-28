/**
 * Pack the jsquash .wasm binaries into assets/codecs/ so the extension can find
 * them even when node_modules is not present (e.g. store bundle).
 * Loader order: node_modules path first, then assets/codecs fallback.
 *
 * The binaries are stored Brotli-compressed as `*.wasm.br`. WebAssembly reads
 * the same either way, but the raw codecs are 5.9 MB on disk and brotli takes
 * that to 1.5 MB (AVIF's encoder alone is 3.4 MB -> 0.8 MB). Decompressing at
 * load costs ~0.6 ms for the common codecs and ~9 ms for the AVIF encoder, and
 * codecs are loaded lazily, so only the ones a given run actually uses are ever
 * decompressed. src/lib/codecs.ts handles both layouts, so a node_modules
 * install (raw .wasm) keeps working.
 *
 * Compressing nine binaries at quality 11 takes ~10 s, so the stamp below lets
 * repeat runs (every `npm install`) short-circuit.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "package.json"));

const WASMS = [
  ["@jsquash/jpeg", "codec/dec/mozjpeg_dec.wasm"],
  ["@jsquash/jpeg", "codec/enc/mozjpeg_enc.wasm"],
  ["@jsquash/png", "codec/pkg/squoosh_png_bg.wasm"],
  ["@jsquash/oxipng", "codec/pkg/squoosh_oxipng_bg.wasm"],
  ["@jsquash/webp", "codec/enc/webp_enc.wasm"],
  ["@jsquash/webp", "codec/enc/webp_enc_simd.wasm"],
  ["@jsquash/webp", "codec/dec/webp_dec.wasm"],
  ["@jsquash/avif", "codec/enc/avif_enc.wasm"],
  ["@jsquash/avif", "codec/dec/avif_dec.wasm"],
];

const QUALITY = 11;
const LGWIN = 24;
/** Bump when the compression settings change, so existing output is rebuilt. */
const PACK_VERSION = 1;

const outDir = join(root, "assets", "codecs");
const stampPath = join(outDir, ".pack-stamp.json");
mkdirSync(outDir, { recursive: true });

const sources = [];
for (const [pkg, rel] of WASMS) {
  try {
    sources.push({ pkg, rel, src: require.resolve(`${pkg}/${rel}`) });
  } catch {
    console.error(`! could not resolve ${pkg}/${rel}`);
  }
}

const stamp = JSON.stringify({
  version: PACK_VERSION,
  quality: QUALITY,
  lgwin: LGWIN,
  files: sources.map(({ pkg, rel, src }) => {
    const st = statSync(src);
    return `${pkg}/${rel}:${st.size}:${Math.round(st.mtimeMs)}`;
  }),
});

const destFor = ({ pkg, rel }) => join(outDir, pkg, `${rel}.br`);

let previous = null;
try {
  previous = readFileSync(stampPath, "utf8");
} catch {
  // no stamp yet — first run, or a fresh checkout
}

if (previous === stamp && sources.every((s) => existsSync(destFor(s)))) {
  console.log(`${sources.length} codecs already packed, skipping`);
} else {
  let rawBytes = 0;
  let packedBytes = 0;
  for (const { pkg, rel, src } of sources) {
    const dest = destFor({ pkg, rel });
    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(src);
    // Settings mirror `brotli -q 11`; the codecs are cold data, so spend the
    // build time once rather than on every load.
    const packed = brotliCompressSync(raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: QUALITY,
        [zlibConstants.BROTLI_PARAM_LGWIN]: LGWIN,
      },
    });
    writeFileSync(dest, packed);
    rawBytes += raw.length;
    packedBytes += packed.length;
    console.log(`packed ${pkg}/${rel} -> ${(packed.length / 1024).toFixed(0)} KB`);
  }
  writeFileSync(stampPath, stamp);
  console.log(
    `done: ${sources.length}/${WASMS.length} wasm files packed ` +
      `(${(rawBytes / 1024 / 1024).toFixed(2)} MB -> ${(packedBytes / 1024 / 1024).toFixed(2)} MB)`,
  );
}

const manifest = join(outDir, "manifest.json");
writeFileSync(
  manifest,
  JSON.stringify(
    WASMS.map(([pkg, rel]) => ({ pkg, rel, path: relative(root, join(outDir, pkg, `${rel}.br`)) })),
    null,
    2,
  ) + "\n",
);
