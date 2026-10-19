/**
 * Compress Images — no-view command operating on the current file-manager selection
 * (Finder on macOS, File Explorer on Windows).
 * Optional one-shot argument: <quality> (also remembered as last-used).
 */
import {
  environment,
  showHUD,
  Toast,
  getSelectedFinderItems,
  Clipboard,
  type LaunchProps,
} from "@raycast/api";
import { mkdir, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { compressFile, fmtKB, fmtPercent, type CompressOptions, type FileResult } from "./lib/pipeline.js";
import { getSettings, rememberCompress } from "./lib/settings.js";

const isMacOS = process.platform === "darwin";

export default async function main(
  props: LaunchProps<{ arguments: { quality: string } }>,
): Promise<void> {
  const settings = getSettings();

  const argQ = Number.parseInt(props.arguments?.quality ?? "", 10);

  const opts: CompressOptions = {
    format: settings.format,
    quality: Number.isFinite(argQ) ? Math.max(1, Math.min(100, argQ)) : settings.quality,
    maxDim: settings.maxDim,
    output: settings.output,
  };

  let files: string[] = [];
  try {
    files = (await getSelectedFinderItems())
      .map((f) => f.path)
      .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    await showHUD(`No images selected in ${isMacOS ? "Finder" : "File Explorer"} 🖼️`);
    return;
  }

  const toast = new Toast({ style: Toast.Style.Animated, title: `Compressing ${files.length} image${files.length > 1 ? "s" : ""}…` });
  await toast.show();

  const tmpDir = join(environment.supportPath ?? "/tmp", `tinypix-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });

  const results: FileResult[] = [];
  for (const f of files) {
    toast.message = basename(f);
    results.push(await compressFile(f, opts, { baseDir: dirname(environment.assetsPath), tmpDir }));
  }

  const ok = results.filter((r) => !r.error && !r.skipped);
  const failed = results.filter((r) => r.error);
  const skipped = results.filter((r) => r.skipped);
  const inSum = ok.reduce((s, r) => s + r.inBytes, 0);
  const outSum = ok.reduce((s, r) => s + r.outBytes, 0);

  if (failed.length === 0 && ok.length === 0) {
    toast.style = Toast.Style.Failure;
    toast.title = "Nothing compressed";
    toast.message = skipped.map((r) => `${basename(r.input)}: ${r.skipped}`).join("; ");
    return;
  }

  if (opts.output === "clipboard") {
    for (const r of ok) if (r.output) await Clipboard.copy({ file: r.output });
  }
  if (ok.length > 0) rememberCompress(opts.quality, opts.maxDim);
  await rm(tmpDir, { recursive: true, force: true });

  toast.hide();
  let hud = `${ok.length} image${ok.length > 1 ? "s" : ""}: ${fmtKB(inSum)} → ${fmtKB(outSum)} (${fmtPercent(inSum, outSum)})`;
  if (opts.output === "clipboard") hud += " · on clipboard";
  if (skipped.length) hud += ` · ${skipped.length} skipped`;
  if (failed.length) hud += ` · ${failed.length} failed`;
  await showHUD(hud);
  if (failed.length) {
    const errToast = new Toast({ style: Toast.Style.Failure, title: "Failures" });
    errToast.message = failed.map((r) => `${basename(r.input)}: ${r.error}`).join("; ");
    await errToast.show();
  }
}
