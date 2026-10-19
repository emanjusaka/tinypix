/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Output Format - Encoder used for the output */
  "format": "keep" | "jpeg" | "webp" | "avif" | "png",
  /** Quality - 0-100 for JPEG/WebP/AVIF. PNG: below 100 enables lossy palette quantization (fewer colors); 100 keeps PNG lossless */
  "quality": string,
  /** Longest Side - Longest side in px; images are only scaled down. 0 = keep size */
  "maxDim": string,
  /** Output - Where compressed results go */
  "output": "suffix" | "replace" | "clipboard"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `compress-images` command */
  export type CompressImages = ExtensionPreferences & {}
  /** Preferences accessible in the `resize-images` command */
  export type ResizeImages = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `compress-images` command */
  export type CompressImages = {
  /** Quality (0-100) */
  "quality": string,
  /** Format (keep/jpeg/png/webp/avif) */
  "format": string
}
  /** Arguments passed to the `resize-images` command */
  export type ResizeImages = {}
}

