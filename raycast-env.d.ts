/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** 输出格式 - 输出使用的编码器 */
  "format": "keep" | "jpeg" | "webp" | "avif" | "png",
  /** 质量 - 0-100，作用于 JPEG/WebP/AVIF；PNG 无损不受影响 */
  "quality": string,
  /** 最长边 - 最长边像素；只缩小不放大。0 = 保持原尺寸 */
  "maxDim": string,
  /** 输出方式 - 压缩结果存放位置 */
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
  /** 质量 (0-100) */
  "quality": string
}
  /** Arguments passed to the `resize-images` command */
  export type ResizeImages = {}
}

