/**
 * Last-used settings: every run remembers the parameters it used (Raycast
 * Cache, persisted), and every command opens with those values next time —
 * no settings page needed. Resolution order per run:
 *   launch argument (one-shot) > last-used > extension preferences (defaults).
 * Preferences are the first-install defaults; after the first run the form's
 * own choices (format, quality, max dimension, output mode) take over.
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
  output?: OutputMode;
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

/** Compress runs (Compress Images, or Resize Images in 仅压缩 mode) remember format + quality + maxDim + output. */
export function rememberCompress(format: TargetFormat, quality: number, maxDim: number, output: OutputMode): void {
  put({ ...getLast(), format, quality, maxDim, output });
}

/** Resize runs remember their form state (preset / custom size / mode / format / quality / output).
 *  maxDim is untouched: resize bypasses it, so the plain-compress value stays. */
export function rememberResize(
  preset: string,
  size: string,
  mode: ResizeMode,
  format: TargetFormat,
  quality: number,
  output: OutputMode,
): void {
  put({ ...getLast(), preset, size, mode, format, quality, output });
}

/** Resize form initial state (falls back to defaults on first run or a stale preset key). */
export function lastResizeState(): { preset: string; size: string; mode: ResizeMode } {
  const last = getLast();
  const valid = new Set<string>([...PRESETS.map((p) => p.key), "custom", "none"]);
  const preset = last.preset && valid.has(last.preset) ? last.preset : "xhs-34";
  return { preset, size: last.size ?? "", mode: last.mode ?? "cover" };
}

/** Resolve effective settings: last-used (from either command) ?? preferences. */
export function getSettings(): EffectiveSettings {
  const prefs = getPreferenceValues<Prefs>();
  const last = getLast();
  const lastFormat =
    last.format !== undefined && (FORMATS as string[]).includes(last.format)
      ? (last.format as TargetFormat)
      : undefined;
  const prefFormat = FORMATS.includes(prefs.format as TargetFormat) ? (prefs.format as TargetFormat) : undefined;
  const lastOutput = last.output !== undefined && OUTPUTS.includes(last.output) ? last.output : undefined;
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
    output: lastOutput ?? (OUTPUTS.includes(prefs.output as OutputMode) ? (prefs.output as OutputMode) : "suffix"),
  };
}
