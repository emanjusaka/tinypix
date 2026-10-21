# TinyPix Changelog

## [Initial Release] - {PR_MERGE_DATE}

- Compress images fully offline with Squoosh wasm codecs (MozJPEG, OxiPNG, WebP, AVIF)
- Format conversion on the fly: `format` launch argument on Compress Images (e.g. `75 webp`) and an Output Format dropdown on the Resize Images form; last-used format is remembered
- Lossy PNG mode: quality < 100 quantizes to a color palette (UPNG quantizer, no dithering) before OxiPNG; quality = 100 stays lossless
- `Compress Images` command operates on the current Finder / File Explorer selection, with an optional `quality` launch argument
- Accept BMP / TIFF / HEIC / GIF / CMYK JPEG inputs by converting them to PNG through macOS `sips` first (mislabelled extensions are detected by magic bytes)
- Unsupported inputs now name the real container (HEIC, GIF, TIFF, BMP) instead of reporting an opaque decoder error
- `Resize Images` command with platform presets (Blog / Xiaohongshu / WeChat), custom size, and cover / fit / scale modes
- EXIF orientation baked in and Lanczos3 resampling, both in-process (no child processes)
- Never upscales; cover falls back to fit when the source is smaller than the preset
- Last-used quality / size / mode remembered across runs
- Output options: `-min` suffix, replace original, or copy to clipboard
