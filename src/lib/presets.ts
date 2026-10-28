/** Built-in size presets for the Resize Images command (platform cover slots). */
import type { ResizeMode } from "./imageops.js";

export interface Preset {
  key: string;
  group: string;
  label: string;
  width: number; // 0 = unconstrained
  height: number; // 0 = unconstrained
  mode: ResizeMode;
}

export const PRESETS: Preset[] = [
  { key: "og", group: "Blog", label: "OG / Link Cover 1200×630", width: 1200, height: 630, mode: "cover" },
  {
    key: "blog-cover",
    group: "Blog",
    label: "Blog Cover 1600×900 (Hi-Res 16:9)",
    width: 1600,
    height: 900,
    mode: "cover",
  },
  {
    key: "blog-cover-s",
    group: "Blog",
    label: "Blog Cover 1200×675 (Lean 16:9)",
    width: 1200,
    height: 675,
    mode: "cover",
  },
  { key: "blog-wide", group: "Blog", label: "Content Width 1600 (Height Auto)", width: 1600, height: 0, mode: "scale" },
  { key: "xhs-34", group: "Xiaohongshu", label: "Cover 3:4 1080×1440", width: 1080, height: 1440, mode: "cover" },
  { key: "xhs-11", group: "Xiaohongshu", label: "Square 1:1 1080×1080", width: 1080, height: 1080, mode: "cover" },
  { key: "wx-cover", group: "WeChat", label: "Head Cover 2.35:1 900×383", width: 900, height: 383, mode: "cover" },
  { key: "wx-thumb", group: "WeChat", label: "Thumbnail 200×200", width: 200, height: 200, mode: "cover" },
  { key: "wx-body", group: "WeChat", label: "Body Width 1080 (Fit, Keep Whole)", width: 1080, height: 0, mode: "fit" },
];

/**
 * Parse a custom size like "1080x1440", "1080x" (width only) or "1080".
 * Returns null when not parseable.
 */
export function parseSize(s: string): { width: number; height: number } | null {
  const m = s.trim().match(/^(\d+)[xX](\d*)$/);
  if (m) return { width: Math.max(1, parseInt(m[1], 10)), height: m[2] ? Math.max(1, parseInt(m[2], 10)) : 0 };
  const n = s.trim().match(/^(\d+)$/);
  if (n) return { width: Math.max(1, parseInt(n[1], 10)), height: 0 };
  return null;
}
