import {
  calculateSavings,
  isEligiblePDF,
  meetsMinimumSavings,
  processingSignature,
} from "../core/logic";
import {
  FileReplacementService,
  temporaryBackupPath,
  temporaryOutputPath,
} from "../core/fileReplacement";
import type {
  FileSnapshot,
  FileSystem,
  OptimizationResult,
  OptimizerSettings,
} from "../core/types";
import type { PDFProcessor } from "./cpdfRunner";
import { logError } from "./logger";
import { FileStabilityWaiter } from "./stability";

export interface PreparedAttachment {
  attachmentID: number;
  path: string;
  snapshot: FileSnapshot;
  signature: string;
}

export interface OptimizationDependencies {
  fs: FileSystem;
  runner: PDFProcessor;
  replacement: FileReplacementService;
  uuid: () => string;
}

function result(
  attachmentID: number,
  status: OptimizationResult["status"],
  reason: OptimizationResult["reason"],
  values: Partial<OptimizationResult> = {},
): OptimizationResult {
  return {
    status,
    reason,
    attachmentID,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    savedPercent: 0,
    ...values,
  };
}

export class PDFOptimizerService {
  constructor(
    private readonly dependencies: OptimizationDependencies,
    private readonly stability: FileStabilityWaiter,
  ) {}

  async prepareAttachment(
    item: Zotero.Item,
    cancelled: () => boolean,
  ): Promise<PreparedAttachment | OptimizationResult> {
    const configuredPath = item.isAttachment() ? item.getFilePath() : false;
    if (
      !isEligiblePDF({
        isAttachment: item.isAttachment(),
        isFileAttachment: item.isAttachment() && item.isFileAttachment(),
        contentType: item.isAttachment() ? item.attachmentContentType : "",
        path: configuredPath,
      })
    ) {
      const reason =
        item.isAttachment() && !item.isFileAttachment()
          ? "not-local-file"
          : "not-pdf";
      return result(item.id, "skipped", reason);
    }

    const stable = await this.stability.wait(
      () => item.getFilePathAsync(),
      cancelled,
    );
    if (cancelled()) return result(item.id, "cancelled", "shutdown");
    if (!stable) {
      return result(
        item.id,
        "skipped",
        configuredPath ? "file-unstable" : "file-missing",
      );
    }

    return {
      attachmentID: item.id,
      path: stable.path,
      snapshot: stable.snapshot,
      signature: processingSignature(item.id, stable.path, stable.snapshot),
    };
  }

  async optimizePrepared(
    prepared: PreparedAttachment,
    settings: OptimizerSettings,
    cancelled: () => boolean,
  ): Promise<OptimizationResult> {
    return this.optimizePath(
      prepared.attachmentID,
      prepared.path,
      settings,
      cancelled,
    );
  }

  async optimizePath(
    attachmentID: number,
    path: string,
    settings: OptimizerSettings,
    cancelled: () => boolean = () => false,
  ): Promise<OptimizationResult> {
    const { fs, runner, replacement, uuid } = this.dependencies;
    const unique = uuid();
    const outputPath = temporaryOutputPath(path, unique);
    const backupPath = temporaryBackupPath(path, unique);
    let originalBytes = 0;

    try {
      if (cancelled()) return result(attachmentID, "cancelled", "shutdown");
      if (!(await fs.exists(path))) {
        return result(attachmentID, "skipped", "file-missing", { path });
      }
      originalBytes = (await fs.stat(path)).size;
      const originalPages = await runner.pageCount(path);
      if (originalPages === null) {
        logError("cpdf-input-validation", "CPDF could not read the input PDF", {
          attachmentID,
          path,
          cpdfPath: runner.executablePath,
        });
        return result(attachmentID, "failed", "cpdf-failed", {
          path,
          originalBytes,
          message: "CPDF could not read the input PDF (it may be encrypted)",
        });
      }

      const process = await runner.optimize(path, outputPath, settings.squeeze);
      if (cancelled()) return result(attachmentID, "cancelled", "shutdown");
      if (process.exitCode !== 0) {
        logError("cpdf-optimize", process.stderr || process.stdout, {
          attachmentID,
          path,
          cpdfPath: runner.executablePath,
          exitCode: process.exitCode,
          stdout: process.stdout.slice(0, 4000),
          stderr: process.stderr.slice(0, 4000),
        });
        return result(attachmentID, "failed", "cpdf-failed", {
          path,
          originalBytes,
          message: process.stderr.trim() || process.stdout.trim(),
        });
      }
      if (!(await fs.exists(outputPath))) {
        logError("cpdf-output-validation", "CPDF output is missing", {
          attachmentID,
          path,
          cpdfPath: runner.executablePath,
          exitCode: process.exitCode,
          stdout: process.stdout.slice(0, 4000),
          stderr: process.stderr.slice(0, 4000),
        });
        return result(attachmentID, "failed", "invalid-output", {
          path,
          originalBytes,
          message: "CPDF did not create an output file",
        });
      }

      const optimizedBytes = (await fs.stat(outputPath)).size;
      if (optimizedBytes <= 0) {
        return result(attachmentID, "failed", "invalid-output", {
          path,
          originalBytes,
          optimizedBytes,
        });
      }
      const optimizedPages = await runner.pageCount(outputPath);
      if (optimizedPages === null) {
        logError("cpdf-output-validation", "CPDF could not read its output", {
          attachmentID,
          path,
          cpdfPath: runner.executablePath,
        });
        return result(attachmentID, "failed", "invalid-output", {
          path,
          originalBytes,
          optimizedBytes,
        });
      }
      const savings = calculateSavings(originalBytes, optimizedBytes);
      const values = {
        path,
        originalBytes,
        optimizedBytes,
        ...savings,
      };
      if (optimizedPages !== originalPages) {
        return result(attachmentID, "skipped", "page-count-changed", values);
      }
      if (optimizedBytes >= originalBytes) {
        return result(attachmentID, "skipped", "not-smaller", values);
      }
      if (
        !meetsMinimumSavings(
          originalBytes,
          optimizedBytes,
          settings.minSavingsBytes,
          settings.minSavingsPercent,
        )
      ) {
        return result(attachmentID, "skipped", "below-minimum-savings", values);
      }

      try {
        await replacement.replace(
          path,
          outputPath,
          backupPath,
          settings.keepBackup,
        );
      } catch (error) {
        const rollbackCompleted =
          error instanceof Error &&
          "rollbackCompleted" in error &&
          error.rollbackCompleted === true;
        logError("file-replacement", error, {
          attachmentID,
          path,
          cpdfPath: runner.executablePath,
          rollbackCompleted,
        });
        return result(attachmentID, "failed", "replacement-failed", {
          ...values,
          rollbackCompleted,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      await Zotero.Notifier.trigger("modify", "item", [attachmentID], {
        zoteroPDFOptimizer: true,
      });
      return result(attachmentID, "optimized", undefined, values);
    } catch (error) {
      logError("optimization", error, {
        attachmentID,
        path,
        cpdfPath: runner.executablePath,
      });
      return result(attachmentID, "failed", "cpdf-failed", {
        path,
        originalBytes,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      try {
        if (await fs.exists(outputPath)) await fs.remove(outputPath);
      } catch (error) {
        logError("temporary-output-cleanup", error, { attachmentID, path });
      }
      try {
        // Remove an orphaned temporary backup only when the original is present.
        if ((await fs.exists(path)) && (await fs.exists(backupPath))) {
          await fs.remove(backupPath);
        }
      } catch (error) {
        logError("temporary-backup-cleanup", error, { attachmentID, path });
      }
    }
  }
}
