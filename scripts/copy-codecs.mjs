/**
 * Copy jsquash .wasm binaries into assets/codecs/ so the extension can find
 * them even when node_modules is not present (e.g. store bundle).
 * Loader order: node_modules path first, then assets/codecs fallback.
 */
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
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

const outDir = join(root, "assets", "codecs");
mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const [pkg, rel] of WASMS) {
  let src;
  try {
    src = require.resolve(`${pkg}/${rel}`);
  } catch {
    console.error(`! could not resolve ${pkg}/${rel}`);
    continue;
  }
  // Layout mirrors the package paths: assets/codecs/@jsquash/jpeg/codec/enc/x.wasm
  const dest = join(outDir, pkg, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
  console.log(`copied ${pkg}/${rel}`);
}

const manifest = join(outDir, "manifest.json");
if (existsSync(manifest)) console.log("manifest.json already exists, skipped");
else {
  writeFileSync(
    manifest,
    JSON.stringify(
      WASMS.map(([pkg, rel]) => ({ pkg, rel, path: relative(root, join(outDir, pkg, rel)) })),
      null,
      2,
    ) + "\n",
  );
  console.log("wrote manifest.json");
}
console.log(`done: ${copied}/${WASMS.length} wasm files copied to assets/codecs`);
