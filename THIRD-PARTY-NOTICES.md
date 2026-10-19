# Third-Party Notices

TinyPix itself is released under the MIT License (see [LICENSE](LICENSE)).
This file acknowledges the third-party software it depends on and redistributes.

## npm dependencies

| Package | License | Copyright |
|---|---|---|
| [UPNG.js](https://github.com/photopea/UPNG.js) (vendored at `src/lib/vendor/upng.ts`) | MIT | © Ivan Kuckir |
| [@jsquash/avif](https://github.com/jamsinclair/jSquash), [@jsquash/jpeg], [@jsquash/oxipng], [@jsquash/png], [@jsquash/webp] | Apache-2.0 | © James Sinclair and jSquash contributors |
| [wasm-feature-detect](https://github.com/GoogleChromeLabs/wasm-feature-detect) | Apache-2.0 | © Google LLC |
| [@raycast/api](https://github.com/raycast/extensions) | MIT | © Raycast Holdings Ltd. |

## Redistributed WebAssembly binaries

The `.wasm` codec binaries under `assets/codecs/` are redistributed verbatim
from the `@jsquash/*` npm packages listed above (Apache-2.0). They build on
upstream codec projects, which retain their respective licenses and copyright
notices, including:

- **MozJPEG** (BSD-3-Clause) — Mozilla Foundation and contributors; derived from libjpeg and the Independent JPEG Group's software
- **OxiPNG** (MIT) — The image-rs Project Developers
- **Squoosh Rust PNG codec** (MIT OR Apache-2.0) — The image-rs Project Developers
- **libwebp** (BSD-3-Clause) — Google LLC
- **rav1e / libaom** (ISC OR Apache-2.0 / BSD-2-Clause) — respective project contributors, for AVIF encoding

The full Apache License 2.0 text is available at
<https://www.apache.org/licenses/LICENSE-2.0>.
