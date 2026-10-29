# TinyPix

在 [Raycast](https://raycast.com) 中直接压缩图片并调整尺寸，作用于当前 Finder 或文件资源管理器中选中的文件，全程离线。

底层使用与 [Squoosh](https://squoosh.app) 相同的 WebAssembly 编解码器（通过 [jSquash](https://github.com/jamsinclair/jSquash)）：MozJPEG、OxiPNG、libwebp 和 libaom。缩放（Lanczos3）与 EXIF 方向处理都在进程内完成。无需 API 密钥，不上传任何文件 —— 图片不会离开你的电脑。

[English](./README.md) | 简体中文

## 功能

- **两种入口** —— 选中文件后快捷键一键处理，没有任何界面；需要精确尺寸时使用表单。
- **平台预设** —— 博客封面、小红书 3:4 与 1:1、微信公众号头图与缩略图。
- **格式转换** —— 保持源格式，或转换为 JPEG、PNG、WebP、AVIF。
- **PNG 可选有损或无损** —— 质量低于 100 时量化到调色板，100 保持无损。
- **绝不放大** —— 小于 cover 目标的源图保持完整，并在结果中提示。
- **记住设置** —— 每次运行的参数自动成为下次的默认值。
- **macOS 与 Windows** —— 通过官方 `getSelectedFinderItems()` API 读取选中项。

## 支持的格式

原生支持：**JPEG、PNG、WebP、AVIF**。

[TinyPNG](https://tinypng.com) 还支持 JPEG XL 和 APNG；jSquash 没有提供这两种格式的编解码器，因此不在支持范围内。动图输入（GIF、APNG）会被拍平，只保留第一帧。

在 macOS 上，系统能读取的其他格式 —— BMP、TIFF、HEIC/HEIF、CMYK JPEG —— 会先通过 `sips` 转换为 PNG（扩展名与实际内容不符的文件会通过文件头魔数识别）。在 Windows 上这些格式会返回明确的“不支持”提示。

## 命令

### Compress Images

对当前 Finder / 文件资源管理器选中项进行无界面处理。

1. 选中图片文件。
2. 运行 **Compress Images**。可选的启动参数可对本次运行临时覆盖已记住的设置：`75 webp` 表示质量 75、转换为 WebP。
3. 每个文件按 Max Dimension 限制最长边后重新压缩；HUD 显示总结果，例如 `3 files: 4.2MB → 890KB (-79%)`。

### Resize Images

一个表单覆盖基于选择器的全部需求：平台尺寸的精确输出，或纯压缩。

1. 文件列表会自动填入当前选中项，也可以在表单中增删改。
2. 选择 **Output Format** —— `Keep`（与源文件相同）、`JPEG`、`PNG`、`WebP` 或 `AVIF`。
3. 选择预设、`Compress Only`，或自定义尺寸。
4. 选择适配模式 —— **cover**（填满并居中裁切到精确尺寸）、**fit**（在框内缩小，保留完整画面）、**scale**（按单边缩放）。
5. 选择 **Output** —— 生成新的 `-min` 文件、覆盖原文件，或复制到剪贴板。
6. 缩放后的输出文件名会带上最终尺寸，例如 `photo-1080x1440.jpg`。

所有输出设置 —— 格式、质量、尺寸、输出方式 —— 都在这一个表单里。偏好设置页只提供首次安装时的默认值。

#### 预设

| 分组 | 预设 | 尺寸 | 模式 |
| --- | --- | --- | --- |
| Blog | OG / 链接封面 | 1200×630 | cover |
| Blog | 封面，Retina | 1600×900 | cover |
| Blog | 封面，精简 | 1200×675 | cover |
| Blog | 正文宽度 | 1600 × 自动 | scale |
| 小红书 | 封面 3:4 | 1080×1440 | cover |
| 小红书 | 方形 | 1080×1080 | cover |
| 微信公众号 | 头图 2.35:1 | 900×383 | cover |
| 微信公众号 | 缩略图 | 200×200 | cover |
| 微信公众号 | 正文宽度 | 1080 × 自动 | fit |

`Compress Only` 跳过缩放，应用最长边限制，并在文件名加上 `-min` 后缀。`Custom Size…` 接受 `1080x1440` 或 `1080x`（仅指定宽度）。

图片永远不会被放大：小于 `cover` 目标的源图会保持完整（fit），并提示 `N smaller than preset`。

## 记住设置

每次运行都会记住本次使用的参数 —— 输出格式、质量、最长边、输出方式，以及上次的预设 / 尺寸 / 适配模式 —— 并成为下次的默认值。表单打开时就已经填好你上次的选项。

**Compress Images** 的可选 `quality` / `format` 启动参数是一次性覆盖，但同样会被记住。在 Resize 表单里选择的输出方式对 **Compress Images** 同样生效，因此不需要为了改输出位置特意去偏好设置页。

## 偏好设置

偏好设置只提供首次安装的默认值；第一次运行之后，记住的参数优先级更高。

| 偏好项 | 默认值 | 说明 |
| --- | --- | --- |
| Output Format | Keep | `Keep`（按源格式重新压缩）、`JPEG`、`WebP`、`AVIF`、`PNG` |
| Quality | 75 | 编码质量 0–100。对 PNG 而言映射为调色板大小：低于 100 会做量化，100 为无损 |
| Max Dimension | 2000 | 最长边上限；只会**缩小**，不会放大（0 = 不缩放） |
| Output Mode | Suffix | `Suffix` 写出 `<name>-min.<ext>`，`Replace` 原地覆盖（无收益时跳过），`Clipboard` 复制结果 |

## 格式行为

- **JPEG / WebP / AVIF** —— 由 Squoosh 的 wasm 编解码器（MozJPEG / libwebp / libaom）按所选质量编码。
- **PNG** —— 质量 < 100 时，颜色被量化到调色板（约 quality × 2.56 种颜色，不抖动），再由 OxiPNG 优化为索引色 PNG；质量 100 时保持**无损**（仅做 OxiPNG 优化）。
- **EXIF 方向** 会在编码前烘焙进像素，因此竖拍手机照片会正向输出。
- **macOS 上的其他输入** —— BMP、TIFF、HEIC/HEIF、GIF（第一帧）和 CMYK JPEG 会先经 `sips` 转为 PNG 再压缩。

## 开发

```bash
npm install    # 同时把 wasm 编解码器打包进 assets/codecs（postinstall）
npm run dev    # 在 Raycast 中打开
npm run build  # 生产构建
npm run lint   # ESLint + Prettier，经由 ray lint
npm run typecheck
npm test       # 17 个端到端用例，走真实流水线
```

首次 `npm install` 会用 Brotli 压缩九个 wasm 二进制，耗时约十秒；打包脚本会记录源文件与压缩参数的时间戳，之后除非源文件或参数变化，否则直接跳过。编解码器以压缩形式存放，因为原始体积为 5.9 MB，压缩后为 1.5 MB；它们按需懒解压，只有本次运行真正用到的格式才会被解包。

测试脚本会用 Pillow 生成样例图片，以与 Raycast 相同的 esbuild 配置打包 `scripts/test-main.ts`，覆盖所有格式、处理路径、输出方式和缩放模式（精确尺寸、带尺寸的文件名、cover→fit 回退）。`applyResize` 另外与 PIL 的 LANCZOS（`resize`、`ImageOps.fit`）做过逐像素比对验证。

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。内置的 wasm 编解码器重新打包自 Apache-2.0 许可的 [jSquash](https://github.com/jamsinclair/jSquash) npm 包；第三方声明见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
