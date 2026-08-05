import type { FileSnapshot, OptimizationResult, SkipReason } from "./types";

export interface EligibilityInput {
  isAttachment: boolean;
  isFileAttachment: boolean;
  contentType: string;
  path: string | false;
}

export function isEligiblePDF(input: EligibilityInput): boolean {
  if (!input.isAttachment || !input.isFileAttachment) {
    return false;
  }
  return (
    input.contentType.toLowerCase() === "application/pdf" ||
    Boolean(input.path && input.path.toLowerCase().endsWith(".pdf"))
  );
}

export function snapshotsEqual(
  left: FileSnapshot | null,
  right: FileSnapshot | null,
): boolean {
  return Boolean(
    left && right && left.size === right.size && left.mtime === right.mtime,
  );
}

export function calculateSavings(
  originalBytes: number,
  newBytes: number,
): {
  savedBytes: number;
  savedPercent: number;
} {
  const savedBytes = originalBytes - newBytes;
  return {
    savedBytes,
    savedPercent: originalBytes > 0 ? (savedBytes / originalBytes) * 100 : 0,
  };
}

export function meetsMinimumSavings(
  originalBytes: number,
  newBytes: number,
  minBytes: number,
  minPercent: number,
): boolean {
  const savings = calculateSavings(originalBytes, newBytes);
  return (
    savings.savedBytes >= Math.max(0, minBytes) &&
    savings.savedPercent >= Math.max(0, minPercent)
  );
}

export function processingSignature(
  attachmentID: number,
  path: string,
  snapshot: FileSnapshot,
): string {
  return `${attachmentID}\u0000${path}\u0000${snapshot.size}\u0000${snapshot.mtime}`;
}

export function classifyResult(
  attachmentID: number,
  reason?: SkipReason,
): OptimizationResult {
  const failedReasons: SkipReason[] = [
    "cpdf-failed",
    "invalid-output",
    "replacement-failed",
  ];
  return {
    status: reason
      ? failedReasons.includes(reason)
        ? "failed"
        : reason === "shutdown"
          ? "cancelled"
          : "skipped"
      : "optimized",
    reason,
    attachmentID,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    savedPercent: 0,
  };
}

export class TaskDeduplicator {
  readonly queued = new Set<number>();
  readonly processing = new Set<number>();
  readonly recent = new Map<string, number>();

  constructor(private readonly recentTTL = 24 * 60 * 60 * 1000) {}

  reserve(id: number): boolean {
    if (this.queued.has(id) || this.processing.has(id)) return false;
    this.queued.add(id);
    return true;
  }

  start(id: number): void {
    this.queued.delete(id);
    this.processing.add(id);
  }

  finish(id: number): void {
    this.queued.delete(id);
    this.processing.delete(id);
  }

  remember(signature: string, now = Date.now()): void {
    this.recent.set(signature, now);
  }

  wasRecent(signature: string, now = Date.now()): boolean {
    for (const [key, timestamp] of this.recent) {
      if (now - timestamp > this.recentTTL) this.recent.delete(key);
    }
    return this.recent.has(signature);
  }

  clear(): void {
    this.queued.clear();
    this.processing.clear();
    this.recent.clear();
  }
}
