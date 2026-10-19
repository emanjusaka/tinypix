/**
 * Resize Images — pick a platform preset (or custom size) + fit mode, then compress.
 * The "Compress Only" preset turns this into a plain compress form (longest-side cap),
 * replacing the former Compress Picked Images command.
 */
import { Form, Action, ActionPanel, environment, showHUD, Toast, Clipboard, getSelectedFinderItems } from "@raycast/api";
import { useEffect, useState, type ReactElement } from "react";
import { mkdir, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { compressFile, fmtKB, fmtPercent, type CompressOptions, type FileResult, type TargetFormat } from "./lib/pipeline.js";
import { PRESETS, parseSize } from "./lib/presets.js";
import type { ResizeMode, ResizeSpec } from "./lib/imageops.js";
import { getSettings, lastResizeState, rememberCompress, rememberResize } from "./lib/settings.js";

const IMG_RE = /\.(jpe?g|png|webp|avif)$/i;

const FORMAT_ITEMS: Array<{ value: TargetFormat; title: string }> = [
  { value: "keep", title: "Keep — Same Format as Source" },
  { value: "jpeg", title: "JPEG" },
  { value: "png", title: "PNG" },
  { value: "webp", title: "WebP" },
  { value: "avif", title: "AVIF" },
];

export default function Command(): ReactElement {
  const settings = getSettings();
  const last = lastResizeState();
  const [files, setFiles] = useState<string[]>([]);
  const [preset, setPreset] = useState(last.preset);
  const [mode, setMode] = useState<ResizeMode>(last.mode);
  const [size, setSize] = useState(last.size);
  const [format, setFormat] = useState<TargetFormat>(settings.format);
  const [quality, setQuality] = useState(String(settings.quality));
  const [maxDim, setMaxDim] = useState(String(settings.maxDim));

  // Prefill from the current Finder / File Explorer selection.
  useEffect(() => {
    (async () => {
      try {
        const sel = (await getSelectedFinderItems())
          .map((f) => f.path)
          .filter((f) => IMG_RE.test(f));
        if (sel.length > 0) setFiles(sel);
      } catch {
        // no selection — the FilePicker below is the fallback
      }
    })();
  }, []);

  const compressOnly = preset === "none";

  function specFromForm(): ResizeSpec | null {
    if (preset === "custom") {
      const p = parseSize(size);
      if (!p) return null;
      return { ...p, mode };
    }
    const p = PRESETS.find((x) => x.key === preset);
    return p ? { width: p.width, height: p.height, mode } : null;
  }

  async function run(): Promise<void> {
    if (files.length === 0) {
      await showHUD("No images selected 🖼️");
      return;
    }
    const q = Math.max(1, Math.min(100, Number.parseInt(quality, 10) || 75));
    const spec = compressOnly ? null : specFromForm();
    if (!compressOnly && !spec) {
      await showHUD("Invalid size — expected 1080x1440 or 1080x");
      return;
    }
    const md = compressOnly ? Math.max(0, Number.parseInt(maxDim, 10) || 0) : 0;
    const opts: CompressOptions = {
      format,
      quality: q,
      maxDim: md,
      output: settings.output,
      ...(spec ? { resize: spec } : {}),
    };

    const toast = new Toast({
      style: Toast.Style.Animated,
      title: `${compressOnly ? "Compressing" : "Resizing"} ${files.length} image${files.length > 1 ? "s" : ""}…`,
    });
    await toast.show();

    const tmpDir = join(environment.supportPath ?? "/tmp", `tinypix-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    const results: FileResult[] = [];
    for (const f of files) {
      toast.message = basename(f);
      results.push(await compressFile(f, opts, { baseDir: dirname(environment.assetsPath), tmpDir }));
    }

    const ok = results.filter((r) => !r.error && !r.skipped);
    if (opts.output === "clipboard") {
      for (const r of ok) if (r.output) await Clipboard.copy({ file: r.output });
    }
    if (ok.length > 0) {
      if (compressOnly) rememberCompress(format, q, md);
      else rememberResize(preset, size, mode, format, q);
    }
    await rm(tmpDir, { recursive: true, force: true });
    toast.hide();

    const failed = results.filter((r) => r.error);
    const fellBack = ok.filter((r) => r.fellBack);
    const inSum = ok.reduce((s, r) => s + r.inBytes, 0);
    const outSum = ok.reduce((s, r) => s + r.outBytes, 0);
    let hud: string;
    if (compressOnly) {
      hud = `${ok.length} image${ok.length > 1 ? "s" : ""}: ${fmtKB(inSum)} → ${fmtKB(outSum)} (${fmtPercent(inSum, outSum)})`;
    } else {
      const s = spec as ResizeSpec;
      hud = `${ok.length} → ${s.width > 0 ? s.width : ""}${s.width && s.height ? "×" : ""}${s.height > 0 ? s.height : "auto"}: ${fmtKB(inSum)} → ${fmtKB(outSum)} (${fmtPercent(inSum, outSum)})`;
      if (fellBack.length) hud += ` · ${fellBack.length} smaller than preset`;
    }
    if (failed.length) hud += ` · ${failed.length} failed`;
    await showHUD(hud);
    if (failed.length) {
      const errToast = new Toast({ style: Toast.Style.Failure, title: "Failures" });
      errToast.message = failed.map((r) => `${basename(r.input)}: ${r.error}`).join("; ");
      await errToast.show();
    }
  }

  const groups = [...new Set(PRESETS.map((p) => p.group))];
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title={compressOnly ? "Compress" : "Resize and Compress"} onSubmit={run} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="Images"
        value={files}
        onChange={(v) => setFiles(v as unknown as string[])}
        allowMultipleSelection
        canChooseDirectories={false}
        info="Prefilled with the current selection — add, remove or replace files here"
      />
      <Form.Dropdown
        id="preset"
        title="Preset"
        value={preset}
        onChange={(v) => {
          setPreset(v);
          const p = PRESETS.find((x) => x.key === v);
          if (p) setMode(p.mode);
        }}
      >
        {groups.map((g) => (
          <Form.Dropdown.Section key={g} title={g}>
            {PRESETS.filter((p) => p.group === g).map((p) => (
              <Form.Dropdown.Item key={p.key} value={p.key} title={p.label} />
            ))}
          </Form.Dropdown.Section>
        ))}
        <Form.Dropdown.Section title="Custom">
          <Form.Dropdown.Item value="none" title="Compress Only (No Resize)" />
          <Form.Dropdown.Item value="custom" title="Custom Size…" />
        </Form.Dropdown.Section>
      </Form.Dropdown>
      {compressOnly ? (
        <Form.TextField
          id="maxDim"
          title="Longest Side (px, 0 = Keep Size)"
          value={maxDim}
          onChange={setMaxDim}
          info="Only ever scaled down; output files get the -min suffix"
        />
      ) : (
        <>
          {preset === "custom" && (
            <Form.TextField
              id="size"
              title="Custom Size"
              placeholder="1080x1440 or 1080x"
              value={size}
              onChange={setSize}
              info="Output filename carries the final size, e.g. photo-1080x1440.jpg"
            />
          )}
          <Form.Dropdown id="mode" title="Mode" value={mode} onChange={(v) => setMode(v as ResizeMode)}>
            <Form.Dropdown.Item value="cover" title="Cover — Fill and Center-Crop to Exact Size" />
            <Form.Dropdown.Item value="fit" title="Fit — Shrink Inside the Box, Keep Whole" />
            <Form.Dropdown.Item value="scale" title="Scale — Proportional Single-Side Resize" />
          </Form.Dropdown>
        </>
      )}
      <Form.Dropdown id="format" title="Output Format" value={format} onChange={(v) => setFormat(v as TargetFormat)}>
        {FORMAT_ITEMS.map((f) => (
          <Form.Dropdown.Item key={f.value} value={f.value} title={f.title} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="quality" title="Quality (1-100)" value={quality} onChange={setQuality} />
    </Form>
  );
}
