# TinyPix Changelog

## [Initial Release] - {PR_MERGE_DATE}

- Compress images fully offline with Squoosh wasm codecs (MozJPEG, OxiPNG, WebP, AVIF)
- Lossy PNG mode: quality < 100 quantizes to a color palette (UPNG quantizer, no dithering) before OxiPNG; quality = 100 stays lossless
- `Compress Images` command operates on the current Finder / File Explorer selection, with an optional `quality` launch argument
- `Resize Images` command with platform presets (Blog / Xiaohongshu / WeChat), custom size, and cover / fit / scale modes
- EXIF orientation baked in and Lanczos3 resampling, both in-process (no child processes)
- Never upscales; cover falls back to fit when the source is smaller than the preset
- Last-used quality / size / mode remembered across runs
- Output options: `-min` suffix, replace original, or copy to clipboard
