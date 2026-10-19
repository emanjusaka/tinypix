# TinyPix

A [Raycast](https://raycast.com) extension that shrinks images — resize dimensions and recompress in one step, fully offline, powered by the same WebAssembly codecs as [Squoosh](https://squoosh.app) (via [jSquash](https://github.com/jamsinclair/jSquash): MozJPEG, Oxipng, WebP, AVIF). Resizing (Lanczos3) and EXIF orientation run in-process — no `sips`, no child processes. Supported inputs: JPEG, PNG, WebP, AVIF.

No API keys, no uploads — everything runs locally. Selection is read via the official `getSelectedFinderItems()` API, so the same code works on macOS and Windows.

## Commands

### Compress Images (file-manager selection)

1. Select image files in Finder (macOS) or File Explorer (Windows).
2. Run **Compress Images** (optional arguments: `quality` and `format` for a one-shot override, e.g. `75 webp`).
3. Each file is resized (if larger than Max Dimension) and recompressed; a HUD shows the total savings, e.g. `3 files: 4.2MB → 890KB (-79%)`.

### Resize Images (form)

One form for everything the picker-based workflow needs: exact-size output for platform cover slots, or plain compression.

1. The form is prefilled with your current selection (or pick files manually).
2. Pick the **Output Format** — `Keep` (same format as source) or convert to `JPEG` / `PNG` / `WebP` / `AVIF`.
3. Choose a preset — blog OG cover `1200×630`, blog cover `1600×900` (Retina) / `1200×675` (lean), content width `1600`; Xiaohongshu 3:4 `1080×1440` / square `1080×1080`; WeChat head cover `900×383` / thumbnail `200×200` / body width `1080` — or `Compress Only` (no resize, longest-side cap applies, files get the `-min` suffix) or `Custom Size…` (`1080x1440`, `1080x`).
4. Pick a fit mode: **cover** (fill the box, center-crop to the exact size), **fit** (shrink inside the box, whole image kept), or **scale** (resize by one side).
5. Output names carry the final size, e.g. `photo-1080x1440.jpg`.

Images are never upscaled: sources too small to fill a `cover` target are kept whole (fit) and reported (`N smaller than preset`).

## Remembered settings

Every run remembers the parameters it used (output format, quality, max dimension, last preset / size / fit mode) and they become the defaults for the next run — forms open pre-filled with your last values. The optional `quality` / `format` launch arguments on **Compress Images** are one-shot overrides that also get remembered; output mode lives in the extension preferences.

## Preferences

| Preference | Default | Description |
| --- | --- | --- |
| Output Format | Keep | `Keep` (recompress in-place format), `JPEG`, `WebP`, `AVIF`, `PNG` — initial default; per-run overrides are remembered |
| Quality | 75 | Encoder quality 0–100. For PNG it maps to palette size: below 100 quantizes to fewer colors, 100 = lossless |
| Max Dimension | 2000 | Longest side cap; images are only ever scaled **down** (0 = no resize) |
| Output Mode | Suffix | `Suffix` writes `<name>-min.<ext>`, `Replace` overwrites in place (skips if no gain), `Clipboard` copies the result |

## Format behaviour

- **JPEG / WebP / AVIF** — encoded by Squoosh wasm codecs (MozJPEG / libwebp / libaom) with the chosen quality.
- **PNG** — at quality < 100, colors are quantized to a palette (≈ quality × 2.56 colors, no dithering) and the result is optimised by Oxipng into an indexed PNG; at quality 100 it stays **lossless** (pure Oxipng optimisation).
- EXIF orientation is baked into the pixels before encoding, so rotated iPhone photos come out upright.
- Other formats (HEIC, GIF, TIFF, BMP) are not supported yet.

## Development

```bash
npm install    # also copies wasm codecs into assets/codecs (postinstall)
npm run typecheck
npm test       # esbuild-bundles the pipeline and runs 15 end-to-end cases
npm run dev    # open in Raycast
```

The test harness generates sample images (via Pillow), bundles `scripts/test-main.ts` with the same esbuild settings Raycast uses, and exercises every format/route/output-mode path plus all resize modes (exact dims, size-suffixed names, cover→fit fallback). `applyResize` was additionally verified pixel-for-pixel against PIL's LANCZOS (`resize`, `ImageOps.fit`).

## License

MIT — see [LICENSE](./LICENSE). The bundled wasm codecs are repackaged from the Apache-2.0 [jSquash](https://github.com/jamsinclair/jSquash) npm packages; third-party notices are in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
