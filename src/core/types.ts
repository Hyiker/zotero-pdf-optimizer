export type OptimizationStatus =
  | "optimized"
  | "skipped"
  | "failed"
  | "cancelled";

export type SkipReason =
  | "automatic-disabled"
  | "not-pdf"
  | "not-local-file"
  | "file-missing"
  | "file-unstable"
  | "cpdf-unavailable"
  | "cpdf-failed"
  | "invalid-output"
  | "page-count-changed"
  | "not-smaller"
  | "below-minimum-savings"
  | "replacement-failed"
  | "duplicate"
  | "shutdown";

export interface OptimizationResult {
  status: OptimizationStatus;
  reason?: SkipReason;
  attachmentID: number;
  path?: string;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  savedPercent: number;
  message?: string;
  rollbackCompleted?: boolean;
}

export interface OptimizerSettings {
  automatic: boolean;
  cpdfPath: string;
  squeeze: boolean;
  minSavingsPercent: number;
  minSavingsBytes: number;
  notifications: boolean;
  keepBackup: boolean;
  debug: boolean;
}

export interface FileSnapshot {
  size: number;
  mtime: number;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ResolvedCPDF {
  path: string;
  source: "custom" | "bundled" | "path";
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileSnapshot>;
  move(source: string, destination: string): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
}
