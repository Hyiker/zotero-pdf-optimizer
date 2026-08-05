import type { OptimizationResult } from "../core/types";
import { getString } from "../utils/locale";
import { formatBytes } from "./controller";

export async function optimizeSelectedPDFs(): Promise<void> {
  const ids = collectSelectedAttachmentIDs();
  if (!ids.length) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({ type: "default", text: getString("no-pdfs-selected") })
      .show(5000);
    return;
  }

  const progress = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeTime: -1,
    closeOnClick: false,
  })
    .createLine({ text: summaryText(ids.length, 0, []), progress: 0 })
    .show();
  const results: OptimizationResult[] = [];

  for (let index = 0; index < ids.length; index++) {
    const item = Zotero.Items.get(ids[index]);
    const path = item.getFilePath();
    progress.changeLine({
      text: `${getString("current-file-label")} ${path ? PathUtils.filename(path) : item.getDisplayTitle()}\n${summaryText(ids.length, index, results)}`,
      progress: Math.round((index / ids.length) * 100),
    });
    results.push(
      await addon.data.controller!.optimizeAttachment(ids[index], true),
    );
  }

  progress.changeLine({
    text: summaryText(ids.length, ids.length, results),
    type: results.some((entry) => entry.status === "failed")
      ? "warning"
      : "success",
    progress: 100,
  });
  progress.startCloseTimer(15000);
}

export function collectAttachmentIDs(items: Zotero.Item[]): number[] {
  const ids = new Set<number>();
  for (const item of items) {
    if (item.isAttachment()) {
      if (isLocalPDF(item)) ids.add(item.id);
      continue;
    }
    for (const id of item.getAttachments()) {
      const attachment = Zotero.Items.get(id);
      if (attachment && isLocalPDF(attachment)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

function isLocalPDF(item: Zotero.Item): boolean {
  if (!item.isAttachment() || !item.isFileAttachment()) return false;
  const path = item.getFilePath();
  return item.isPDFAttachment() || Boolean(path && /\.pdf$/i.test(path));
}

function collectSelectedAttachmentIDs(): number[] {
  const pane = ztoolkit.getGlobal("ZoteroPane");
  return collectAttachmentIDs(pane.getSelectedItems());
}

function summaryText(
  total: number,
  completed: number,
  results: OptimizationResult[],
): string {
  const optimized = results.filter(
    (entry) => entry.status === "optimized",
  ).length;
  const skipped = results.filter((entry) => entry.status === "skipped").length;
  const failed = results.filter((entry) => entry.status === "failed").length;
  const original = results.reduce((sum, entry) => sum + entry.originalBytes, 0);
  const after = results.reduce(
    (sum, entry) =>
      sum +
      (entry.status === "optimized"
        ? entry.optimizedBytes
        : entry.originalBytes),
    0,
  );
  const saved = original - after;
  const percent = original > 0 ? (saved / original) * 100 : 0;
  return `${getString("total-label")} ${total} · ${getString("completed-label")} ${completed} · ${getString("optimized-label")} ${optimized} · ${getString("skipped-label")} ${skipped} · ${getString("failed-label")} ${failed}\n${formatBytes(original)} → ${formatBytes(after)} · ${getString("saved-label")} ${formatBytes(saved)} (${percent.toFixed(1)}%)`;
}
