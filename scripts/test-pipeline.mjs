/**
 * E2E test runner: bundles src via esbuild (same bundler Raycast uses),
 * then executes the bundle against sample images in /tmp/e2e-src.
 * Validates BOTH the pipeline and the esbuild-bundling path for jsquash glues.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "package.json"));
const node = process.execPath;
const esbuild = require.resolve("esbuild/bin/esbuild");
const outDir = join(root, ".test");
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, "bundle.mjs");

const GEN_PY = `
from PIL import Image, ImageDraw
import random
random.seed(7)
w, h = 3000, 2000
img = Image.new('RGB', (w, h))
px = img.load()
for y in range(h):
    for x in range(0, w, 4):
        c = (x*255//w, y*255//h, (x+y)*255//(w+h))
        for dx in range(4):
            if x+dx < w: px[x+dx, y] = c
d = ImageDraw.Draw(img)
for i in range(150):
    x0, y0 = random.randint(0,w-1), random.randint(0,h-1)
    r = random.randint(10, 140)
    d.ellipse([x0-r, y0-r, x0+r, y0+r], fill=(random.randint(0,255),)*3)
img.save('__SRC__/photo.jpg', quality=95)
img.save('__SRC__/photo.png')

# indexed-color PNG source (palette ≤256) for the lossless fast-path check
img.convert('P', palette=Image.ADAPTIVE, colors=64).save('__SRC__/photo-pal.png')

# EXIF orientation 6 (90° CW) sample
ex = Image.Exif()
ex[274] = 6
img.save('__SRC__/photo-rot6.jpg', quality=95, exif=ex)
print("samples ready")
`;

console.log("— esbuild bundle (format=esm, platform=node) —");
execFileSync(
  esbuild,
  [
    join(root, "scripts/test-main.ts"),
    "--bundle", `--outfile=${bundle}`,
    "--format=esm", "--platform=node", "--target=node20",
    "--log-level=warning",
  ],
  { stdio: "inherit", cwd: root },
);
console.log(`bundle ok: ${bundle}`);

// sample images
console.log("— generating sample images —");
const srcDir = "/tmp/e2e-src";
mkdirSync(srcDir, { recursive: true });
if (!existsSync(join(srcDir, "photo.jpg")) || !existsSync(join(srcDir, "photo-rot6.jpg"))) {
  const py = join(outDir, "gen-samples.py");
  writeFileSync(py, GEN_PY.replace(/__SRC__/g, srcDir));
  execFileSync(process.env.PYTHON_BIN || "/Users/xiongwei/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3", [py], { stdio: "inherit" });
}
// Run the bundle IN-PROCESS (dynamic import): a nested `node` child-process
// hits sandbox quirks where file writes silently no-op.
console.log("— running bundle (in-process) —");
process.env.EXT_DIR = root;
await import(pathToFileURL(bundle).href);
console.log("E2E DONE");
