# TinyPix

Resize and compress images in [Raycast](https://raycast.com), straight from the current Finder or File Explorer selection — fully offline.

Powered by the same WebAssembly codecs as [Squoosh](https://squoosh.app) (via [jSquash](https://github.com/jamsinclair/jSquash)): MozJPEG, OxiPNG, libwebp and libaom. Resizing (Lanczos3) and EXIF orientation run in-process. No API keys, no uploads — nothing leaves your machine.

English | [简体中文](./README.zh-CN.md)

## Features

- **Two entry points** — a zero-UI hotkey run over the selection, or a form when you need exact dimensions.
- **Platform presets** — blog covers, Xiaohongshu 3:4 and 1:1, WeChat head covers and thumbnails.
- **Format conversion** — keep the source format, or convert to JPEG, PNG, WebP or AVIF.
- **Lossy or lossless PNG** — quality below 100 quantizes to a palette, 100 stays lossless.
- **Never upscales** — sources too small for a cover target are kept whole and reported.
- **Remembers everything** — each run becomes the default for the next one.
- **macOS and Windows** — selection is read through the official `getSelectedFinderItems()` API.

## Supported formats

Native: **JPEG, PNG, WebP, AVIF**.

[TinyPNG](https://tinypng.com) additionally accepts JPEG XL and APNG; jSquash ships no codecs for those, so they stay out of scope, and animated inputs (GIF, APNG) are flattened to their first frame.

On macOS, anything else the system can read — BMP, TIFF, HEIC/HEIF, CMYK JPEG — is converted to PNG through `sips` first (mislabelled files are caught by magic bytes). On Windows those report a clear "not supported" message.

## Commands

### Compress Images

Zero-UI run over the current Finder / File Explorer selection.

1. Select image files.
2. Run **Compress Images**. Optional launch arguments override the remembered settings for one run: `75 webp` means quality 75, converted to WebP.
3. Each file is capped at the Max Dimension and recompressed; a HUD reports the total, e.g. `3 files: 4.2MB → 890KB (-79%)`.

### Resize Images

One form covering everything the picker-based workflow needs: exact sizes for platform slots, or plain compression.

1. The file list is prefilled with your current selection; add or replace files in the form.
2. Pick an **Output Format** — `Keep` (same as source), `JPEG`, `PNG`, `WebP` or `AVIF`.
3. Choose a preset, `Compress Only` or a custom size.
4. Pick a fit mode — **cover** (fill the box, center-crop to exact size), **fit** (shrink inside the box, keep the whole image) or **scale** (resize by one side).
5. Choose the **Output** — a new `-min` file, replace the original, or copy to the clipboard.
6. Resized output names carry the final size, e.g. `photo-1080x1440.jpg`.

Every output setting — format, quality, size, output mode — lives on this one form. The preferences page only supplies first-install defaults.

#### Presets

| Group | Preset | Size | Mode |
| --- | --- | --- | --- |
| Blog | OG / link cover | 1200×630 | cover |
| Blog | Cover, Retina | 1600×900 | cover |
| Blog | Cover, lean | 1200×675 | cover |
| Blog | Content width | 1600 × auto | scale |
| Xiaohongshu | Cover 3:4 | 1080×1440 | cover |
| Xiaohongshu | Square | 1080×1080 | cover |
| WeChat | Head cover 2.35:1 | 900×383 | cover |
| WeChat | Thumbnail | 200×200 | cover |
| WeChat | Body width | 1080 × auto | fit |

`Compress Only` skips resizing, applies the longest-side cap and writes the `-min` suffix. `Custom Size…` takes `1080x1440` or `1080x` (width only).

Images are never upscaled: a source too small to fill a `cover` target is kept whole (fit) and reported as `N smaller than preset`.

## Remembered settings

Every run remembers the parameters it used — output format, quality, max dimension, output mode, and the last preset / size / fit mode — and they become the defaults next time. Forms open pre-filled with your last values.

The optional `quality` / `format` launch arguments on **Compress Images** are one-shot overrides that also get remembered. Output mode chosen on the Resize form applies to **Compress Images** too, so it never needs a trip to the preferences page.

## Preferences

Preferences supply first-install defaults only; after the first run, remembered values take precedence.

| Preference | Default | Description |
| --- | --- | --- |
| Output Format | Keep | `Keep` (recompress in the source format), `JPEG`, `WebP`, `AVIF`, `PNG` |
| Quality | 75 | Encoder quality 0–100. For PNG this maps to palette size: below 100 quantizes, 100 is lossless |
| Max Dimension | 2000 | Longest-side cap; images are only ever scaled **down** (0 = no resize) |
| Output Mode | Suffix | `Suffix` writes `<name>-min.<ext>`, `Replace` overwrites in place (skips when there is no gain), `Clipboard` copies the result |

## Format behaviour

- **JPEG / WebP / AVIF** — encoded by the Squoosh wasm codecs (MozJPEG / libwebp / libaom) at the chosen quality.
- **PNG** — at quality < 100, colours are quantized to a palette (≈ quality × 2.56 colours, no dithering) and optimised by OxiPNG into an indexed PNG; at quality 100 it stays **lossless** (pure OxiPNG optimisation).
- **EXIF orientation** is baked into the pixels before encoding, so rotated phone photos come out upright.
- **Other inputs on macOS** — BMP, TIFF, HEIC/HEIF, GIF (first frame) and CMYK JPEG go through `sips` to PNG before compression.

## Development

```bash
npm install    # also packs the wasm codecs into assets/codecs (postinstall)
npm run dev    # open in Raycast
npm run build  # production build
npm run lint   # ESLint + Prettier, via ray lint
npm run typecheck
npm test       # 17 end-to-end cases through the real pipeline
```

The first `npm install` Brotli-packs nine wasm binaries, which takes about ten seconds; the packer keeps a stamp of its sources and settings and short-circuits on later runs until either changes. Codecs are stored compressed because the raw set is 5.9 MB and packs to 1.5 MB; they are decompressed lazily, only for the formats a given run touches.

The test harness generates sample images (via Pillow), bundles `scripts/test-main.ts` with the same esbuild settings Raycast uses, and exercises every format, route and output mode plus all resize modes (exact dimensions, size-suffixed names, cover→fit fallback). `applyResize` was additionally verified pixel-for-pixel against PIL's LANCZOS (`resize`, `ImageOps.fit`).

## License

MIT — see [LICENSE](./LICENSE). The bundled wasm codecs are repackaged from the Apache-2.0 [jSquash](https://github.com/jamsinclair/jSquash) npm packages; third-party notices are in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
