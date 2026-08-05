import { FileReplacementService } from "../core/fileReplacement";
import type { OptimizationResult, OptimizerSettings } from "../core/types";
import { getString } from "../utils/locale";
import { AttachmentWatcher } from "./attachmentWatcher";
import { CPDFResolver } from "./cpdfResolver";
import { CPDFRunner } from "./cpdfRunner";
import { ZoteroFileSystem } from "./fileSystem";
import { OptimizationQueue } from "./optimizationQueue";
import { PDFOptimizerService } from "./pdfOptimizer";
import { ProcessRunner } from "./processRunner";
import { getSettings } from "./settings";
import { FileStabilityWaiter } from "./stability";

export interface CPDFTestResult {
  found: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export class PluginController {
  private readonly fs = new ZoteroFileSystem();
  private readonly processes = new ProcessRunner();
  private readonly resolver = new CPDFResolver();
  private readonly queue = new OptimizationQueue(
    (settings) => this.createOptimizer(settings),
    this.fs,
    (result) => this.showAutomaticResult(result),
  );
  private readonly watcher = new AttachmentWatcher(this.queue);

  start(): void {
    this.watcher.start();
  }

  shutdown(): void {
    this.watcher.stop();
    this.queue.shutdown();
    this.processes.shutdown();
  }

  optimizeAttachment(
    attachmentID: number,
    manual: boolean,
  ): Promise<OptimizationResult> {
    return this.queue.enqueue(attachmentID, manual, getSettings());
  }

  async detectCPDF(customPath = ""): Promise<string | null> {
    return (await this.resolver.resolve(customPath))?.path ?? null;
  }

  async testCPDF(customPath: string): Promise<CPDFTestResult> {
    const resolved = await this.resolver.resolve(customPath);
    if (!resolved) return { found: false, error: getString("cpdf-not-found") };
    try {
      const process = await new CPDFRunner(
        resolved.path,
        this.processes,
      ).version();
      if (process.exitCode !== 0) {
        return {
          found: true,
          path: resolved.path,
          error: process.stderr.trim() || `Exit code ${process.exitCode}`,
        };
      }
      return {
        found: true,
        path: resolved.path,
        version: (process.stdout || process.stderr).trim(),
      };
    } catch (error) {
      return {
        found: true,
        path: resolved.path,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createOptimizer(
    settings: OptimizerSettings,
  ): Promise<PDFOptimizerService | null> {
    const resolved = await this.resolver.resolve(settings.cpdfPath);
    if (!resolved) return null;
    const runner = new CPDFRunner(resolved.path, this.processes);
    const replacement = new FileReplacementService(this.fs);
    return new PDFOptimizerService(
      {
        fs: this.fs,
        runner,
        replacement,
        uuid: () =>
          Services.uuid.generateUUID().toString().replace(/[{}]/g, ""),
      },
      new FileStabilityWaiter(this.fs),
    );
  }

  private showAutomaticResult(result: OptimizationResult): void {
    if (result.status !== "optimized" || !getSettings().notifications) return;
    const name = result.path ? PathUtils.filename(result.path) : "PDF";
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        type: "success",
        progress: 100,
        text: `${name}: ${formatBytes(result.originalBytes)} → ${formatBytes(
          result.optimizedBytes,
        )}; ${getString("saved-label")} ${formatBytes(result.savedBytes)} (${result.savedPercent.toFixed(1)}%)`,
      })
      .show(8000);
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
