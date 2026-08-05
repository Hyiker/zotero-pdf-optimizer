import { processingSignature, TaskDeduplicator } from "../core/logic";
import type { OptimizationResult, OptimizerSettings } from "../core/types";
import type { PDFOptimizerService, PreparedAttachment } from "./pdfOptimizer";
import type { FileSystem } from "../core/types";
import { debug, logError } from "./logger";

interface QueueTask {
  attachmentID: number;
  manual: boolean;
  settings: OptimizerSettings;
  resolve(result: OptimizationResult): void;
}

export class OptimizationQueue {
  private tasks: QueueTask[] = [];
  private running = false;
  private accepting = true;
  readonly deduplicator = new TaskDeduplicator();

  constructor(
    private readonly optimizerFactory: (
      settings: OptimizerSettings,
    ) => Promise<PDFOptimizerService | null>,
    private readonly fs: FileSystem,
    private readonly onAutomaticResult: (result: OptimizationResult) => void,
  ) {}

  enqueue(
    attachmentID: number,
    manual: boolean,
    settings: OptimizerSettings,
  ): Promise<OptimizationResult> {
    if (!this.accepting) {
      return Promise.resolve(
        this.simpleResult(attachmentID, "cancelled", "shutdown"),
      );
    }
    if (!this.deduplicator.reserve(attachmentID)) {
      return Promise.resolve(
        this.simpleResult(attachmentID, "skipped", "duplicate"),
      );
    }

    return new Promise((resolve) => {
      const task = { attachmentID, manual, settings, resolve };
      if (manual) this.tasks.unshift(task);
      else this.tasks.push(task);
      debug("Task queued", {
        attachmentID,
        manual,
        queueLength: this.tasks.length,
      });
      void this.drain();
    });
  }

  shutdown(): void {
    this.accepting = false;
    for (const task of this.tasks.splice(0)) {
      this.deduplicator.finish(task.attachmentID);
      task.resolve(
        this.simpleResult(task.attachmentID, "cancelled", "shutdown"),
      );
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.accepting && this.tasks.length) {
        const task = this.tasks.shift()!;
        this.deduplicator.start(task.attachmentID);
        let taskResult: OptimizationResult;
        try {
          taskResult = await this.runTask(task);
        } catch (error) {
          logError("queue-task", error, { attachmentID: task.attachmentID });
          taskResult = this.simpleResult(
            task.attachmentID,
            "failed",
            "cpdf-failed",
          );
        } finally {
          this.deduplicator.finish(task.attachmentID);
        }
        task.resolve(taskResult);
        if (!task.manual) this.onAutomaticResult(taskResult);
      }
    } finally {
      this.running = false;
    }
  }

  private async runTask(task: QueueTask): Promise<OptimizationResult> {
    const optimizer = await this.optimizerFactory(task.settings);
    if (!optimizer) {
      return this.simpleResult(
        task.attachmentID,
        "skipped",
        "cpdf-unavailable",
      );
    }
    const item = await Zotero.Items.getAsync(task.attachmentID);
    const prepared = await optimizer.prepareAttachment(
      item,
      () => !this.accepting,
    );
    if ("status" in prepared) return prepared;
    if (!task.manual && this.deduplicator.wasRecent(prepared.signature)) {
      return this.simpleResult(task.attachmentID, "skipped", "duplicate");
    }

    const taskResult = await optimizer.optimizePrepared(
      prepared as PreparedAttachment,
      task.settings,
      () => !this.accepting,
    );
    // Remember deterministic results for this exact file. This prevents repeated
    // retries of encrypted/invalid PDFs as well as our own modify notification.
    if (taskResult.status !== "cancelled") {
      this.deduplicator.remember(prepared.signature);
    }
    if (taskResult.status === "optimized" && taskResult.path) {
      try {
        const snapshot = await this.fs.stat(taskResult.path);
        this.deduplicator.remember(
          processingSignature(task.attachmentID, taskResult.path, snapshot),
        );
      } catch {
        // A later event can safely re-check the attachment.
      }
    }
    return taskResult;
  }

  private simpleResult(
    attachmentID: number,
    status: OptimizationResult["status"],
    reason: OptimizationResult["reason"],
  ): OptimizationResult {
    return {
      attachmentID,
      status,
      reason,
      originalBytes: 0,
      optimizedBytes: 0,
      savedBytes: 0,
      savedPercent: 0,
    };
  }
}
