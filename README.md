# Zotero PDF Optimizer

Zotero PDF Optimizer is a Zotero 7+ plugin that asks [CPDF](https://www.coherentpdf.com/) to remove the application-private `/PieceInfo` dictionary from local PDF attachments. It can additionally run CPDF's lossless `-squeeze` pass, then replaces the attachment only when the validated output is smaller by both configured thresholds.

Some PDF producers store large, application-specific editing data under `/PieceInfo`. Removing it can greatly reduce affected files, while many PDFs will see little or no change. This plugin does not claim that every PDF will shrink.

## Safety and scope

The default transformation is limited to `/PieceInfo`. It does not request removal of ordinary metadata, XMP, annotations, embedded attachments, bookmarks, forms, layers, fonts, images, JavaScript, or document IDs. Enabling Squeeze asks CPDF to compact losslessly; the plugin does not intentionally lower image resolution.

Every automatic or manual job:

1. waits until the local attachment exists and its size and modification time are stable across repeated checks;
2. reads the original page count with CPDF;
3. writes CPDF output to a unique temporary PDF in the original directory;
4. requires a successful exit code, a non-empty output, and the same page count;
5. requires `savedBytes >= minSavingsBytes` **and** `savedPercent >= minSavingsPercent`;
6. renames the original to a temporary rollback file, renames the output to the attachment's original path, and verifies the result;
7. removes the rollback file only after success, or restores it if replacement fails.

The original PDF is never passed to CPDF as its own output. Paths are supplied as an executable plus an argument array, so spaces, Chinese characters, and other Unicode characters do not require shell escaping.

> **Digital-signature warning:** any PDF rewrite can invalidate a digital signature. This MVP does not pretend that a byte-string search is reliable signature detection. Review signed PDFs before optimizing them. Password-protected or encrypted PDFs that CPDF cannot open are reported and left unchanged.

## Install and configure CPDF

This repository does not contain, download, or install CPDF. Install CPDF yourself and either:

- enter the absolute executable path under Zotero Settings → PDF Optimizer;
- use **Auto Detect** to locate `cpdf.exe`/`cpdf` on `PATH`; or
- use **Choose File…**.

Use **Test CPDF** to run `cpdf -version` and display the resolved path, version output, or error. Resolution order is the configured path, a future extracted bundled executable, then system `PATH`. The bundled-provider abstraction intentionally returns no executable in this version: an XPI resource must first be copied to a writable cache and given suitable permissions before execution.

The main command is equivalent to:

```text
cpdf.exe -remove-dict-entry /PieceInfo -squeeze input.pdf -o output.pdf
```

With Squeeze disabled:

```text
cpdf.exe -remove-dict-entry /PieceInfo input.pdf -o output.pdf
```

CPDF's open-source edition is licensed under the AGPL. Users are responsible for obtaining and using CPDF under applicable terms. If a future release distributes a CPDF binary, its source, notices, and distribution obligations must be reviewed separately; CPDF code or binaries must not be represented as this plugin's own code.

## Use

Automatic optimization is enabled by default. Item and file add/modify notifications enter a single-worker queue. Connector and sync downloads are allowed up to 30 seconds to appear and stabilize. Queued/processing sets plus attachment/path/size/mtime signatures suppress duplicate events, the plugin's own file-refresh notification, and repeated attempts against the same deterministic failure.

For manual use, select one or more PDF attachments or regular bibliographic items and choose **Optimize Selected PDF(s)** from the item-list context menu. Regular items contribute their directly associated PDF attachments. One non-modal progress window reports total/current files, optimized/skipped/failed counts, original and final totals, saved bytes, and percentage.

Settings and defaults:

- automatic optimization: on;
- CPDF executable path: empty (auto-resolve from `PATH`);
- lossless Squeeze: on;
- minimum savings: 1% and 64 KiB, both required;
- automatic success notifications: on;
- retain original backup: off;
- debug logging: off.

When retained, backups use `name.zotero-pdf-optimizer-original.pdf` with a numeric suffix if needed. Temporary rollback files are always used regardless of this setting.

## Development

The repository remains on `windingwind/zotero-plugin-template` and its existing scaffold/esbuild pipeline.

```bash
npm install
npm test
npm run lint:check
npm run build
npm start
```

On systems where the scaffold cannot discover Zotero, set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to the Zotero executable before `npm test` or `npm start`. The optional real-CPDF integration test runs only when `CPDF_PATH` is also set; otherwise it is skipped.

The current `package.json` still contains template placeholder publication metadata (`name`, `addonName`, `addonID`, `addonRef`, `addonInstance`, repository, author, and homepage). Confirm and replace these values consistently before publishing; no release identity was invented in this implementation.

## Implementation notes

The Zotero APIs used here were checked against installed `zotero-types 4.1.0-beta.4` declarations: `types/xpcom/notifier.d.ts`, `types/xpcom/data/item.d.ts`, `types/xpcom/preferencePanes.d.ts`, `types/platform.d.ts`, and generated Gecko `IOUtils`/`PathUtils` declarations. Menu, progress-window, and file-picker behavior follows installed `zotero-plugin-toolkit 5.1.0-beta.13` declarations and the original template examples.

`Zotero.Utilities.Internal.exec` is intentionally not used because its installed type returns only `true | Error`. The process wrapper uses Firefox's `Subprocess.sys.mjs` pipe API to obtain stdout, stderr, and exit code. After replacement the plugin emits the supported Zotero item modify notification for UI consumers. It does not write SQLite fields directly; Zotero's storage sync checks attachment modification time/hash when detecting locally changed files.
