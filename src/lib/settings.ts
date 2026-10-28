/**
 * Last-used settings: every run remembers the parameters it used (Raycast
 * Cache, persisted), and every command opens with those values next time —
 * no settings page needed. Resolution order per run:
 *   launch argument (one-shot) > last-used > extension preferences (defaults).
 * output is a stable choice and lives only in preferences.
 */
import { Cache, getPreferenceValues } from "@raycast/api";
import type { TargetFormat, OutputMode } from "./pipeline.js";
import type { ResizeMode } from "./imageops.js";
import { PRESETS } from "./presets.js";

export interface EffectiveSettings {
  format: TargetFormat;
  quality: number;
  maxDim: number;
  output: OutputMode;
}

interface Prefs {
  format: string;
  quality: string;
  maxDim: string;
  output: string;
}

interface LastUsed {
  format?: TargetFormat;
  quality?: number;
  maxDim?: number;
  preset?: string;
  mode?: ResizeMode;
  size?: string;
}

const FORMATS: TargetFormat[] = ["keep", "jpeg", "webp", "avif", "png"];
const OUTPUTS: OutputMode[] = ["suffix", "replace", "clipboard"];

/** Normalize a user-typed format string ("JPG", " webp" …); null when invalid. */
export function normalizeFormat(raw: string): TargetFormat | null {
  const f = raw.trim().toLowerCase();
  const canon = f === "jpg" ? "jpeg" : f;
  return (FORMATS as string[]).includes(canon) ? (canon as TargetFormat) : null;
}

const cache = new Cache();
const KEY = "last-used";

function getLast(): LastUsed {
  try {
    return JSON.parse(cache.get(KEY) ?? "{}") as LastUsed;
  } catch {
    return {};
  }
}

function put(v: LastUsed): void {
  cache.set(KEY, JSON.stringify(v));
}

/** Compress runs (Compress Images, or Resize Images in 仅压缩 mode) remember format + quality + maxDim. */
export function rememberCompress(format: TargetFormat, quality: number, maxDim: number): void {
  put({ ...getLast(), format, quality, maxDim });
}

/** Resize runs remember their form state (preset / custom size / mode / format / quality).
 *  maxDim is untouched: resize bypasses it, so the plain-compress value stays. */
export function rememberResize(
  preset: string,
  size: string,
  mode: ResizeMode,
  format: TargetFormat,
  quality: number,
): void {
  put({ ...getLast(), preset, size, mode, format, quality });
}

/** Resize form initial state (falls back to defaults on first run or a stale preset key). */
export function lastResizeState(): { preset: string; size: string; mode: ResizeMode } {
  const last = getLast();
  const valid = new Set<string>([...PRESETS.map((p) => p.key), "custom", "none"]);
  const preset = last.preset && valid.has(last.preset) ? last.preset : "xhs-34";
  return { preset, size: last.size ?? "", mode: last.mode ?? "cover" };
}

/** Resolve effective compress settings: last-used format/quality/maxDim ?? preferences. */
export function getSettings(): EffectiveSettings {
  const prefs = getPreferenceValues<Prefs>();
  const last = getLast();
  const lastFormat =
    last.format !== undefined && (FORMATS as string[]).includes(last.format)
      ? (last.format as TargetFormat)
      : undefined;
  const prefFormat = FORMATS.includes(prefs.format as TargetFormat) ? (prefs.format as TargetFormat) : undefined;
  return {
    format: lastFormat ?? prefFormat ?? "keep",
    quality:
      typeof last.quality === "number"
        ? Math.max(1, Math.min(100, Math.round(last.quality)))
        : Math.max(1, Math.min(100, Number.parseInt(prefs.quality, 10) || 75)),
    maxDim:
      typeof last.maxDim === "number"
        ? Math.max(0, Math.round(last.maxDim))
        : Math.max(0, Number.parseInt(prefs.maxDim, 10) || 0),
    output: OUTPUTS.includes(prefs.output as OutputMode) ? (prefs.output as OutputMode) : "suffix",
  };
}
