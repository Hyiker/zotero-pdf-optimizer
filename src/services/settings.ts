import type { OptimizerSettings } from "../core/types";
import { getPref, setPref } from "../utils/prefs";

const finiteNonNegative = (value: number, fallback: number): number =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

export function getSettings(): OptimizerSettings {
  return {
    automatic: getPref("automatic"),
    cpdfPath: getPref("cpdfPath").trim(),
    squeeze: getPref("squeeze"),
    minSavingsPercent: finiteNonNegative(getPref("minSavingsPercent"), 1),
    minSavingsBytes: finiteNonNegative(getPref("minSavingsBytes"), 65536),
    notifications: getPref("notifications"),
    keepBackup: getPref("keepBackup"),
    debug: getPref("debug"),
  };
}

export function setCPDFPath(path: string): void {
  setPref("cpdfPath", path.trim());
}
