import type { FileSystem } from "./types";

export interface ReplacementResult {
  backupPath?: string;
  rollbackCompleted: boolean;
}

export function temporaryOutputPath(path: string, uuid: string): string {
  const parent = PathUtils.parent(path);
  if (!parent) throw new Error("PDF path has no parent directory");
  const name = PathUtils.filename(path).replace(/\.pdf$/i, "");
  return PathUtils.join(parent, `.${name}.zotero-pdf-optimizer-${uuid}.pdf`);
}

export function temporaryBackupPath(path: string, uuid: string): string {
  const parent = PathUtils.parent(path);
  if (!parent) throw new Error("PDF path has no parent directory");
  const name = PathUtils.filename(path).replace(/\.pdf$/i, "");
  return PathUtils.join(
    parent,
    `.${name}.zotero-pdf-optimizer-backup-${uuid}.pdf`,
  );
}

export class FileReplacementService {
  constructor(private readonly fs: FileSystem) {}

  async replace(
    originalPath: string,
    outputPath: string,
    temporaryBackup: string,
    keepBackup: boolean,
  ): Promise<ReplacementResult> {
    let originalMoved = false;
    let outputMoved = false;
    let rollbackCompleted = false;
    let permanentBackup: string | undefined;

    try {
      await this.fs.move(originalPath, temporaryBackup);
      originalMoved = true;
      await this.fs.move(outputPath, originalPath);
      outputMoved = true;
      const stat = await this.fs.stat(originalPath);
      if (stat.size <= 0) throw new Error("Replacement PDF is empty");

      if (keepBackup) {
        permanentBackup = await this.uniqueBackupPath(originalPath);
        await this.fs.move(temporaryBackup, permanentBackup);
      } else {
        await this.fs.remove(temporaryBackup);
      }
      originalMoved = false;
      return { backupPath: permanentBackup, rollbackCompleted: false };
    } catch (error) {
      if (originalMoved) {
        try {
          if (outputMoved && (await this.fs.exists(originalPath))) {
            await this.fs.remove(originalPath);
          }
          await this.fs.move(temporaryBackup, originalPath);
          rollbackCompleted = true;
          originalMoved = false;
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "PDF replacement and rollback both failed",
          );
        }
      }
      const wrapped = error instanceof Error ? error : new Error(String(error));
      Object.assign(wrapped, { rollbackCompleted });
      throw wrapped;
    } finally {
      if (await this.fs.exists(outputPath)) await this.fs.remove(outputPath);
      if (originalMoved && (await this.fs.exists(temporaryBackup))) {
        // Preserve the only known-good original if rollback itself was impossible.
      }
    }
  }

  private async uniqueBackupPath(originalPath: string): Promise<string> {
    const parent = PathUtils.parent(originalPath);
    if (!parent) throw new Error("PDF path has no parent directory");
    const filename = PathUtils.filename(originalPath);
    const extensionIndex = filename.toLowerCase().lastIndexOf(".pdf");
    const stem =
      extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
    let index = 1;
    while (true) {
      const suffix = index === 1 ? "" : `-${index}`;
      const candidate = PathUtils.join(
        parent,
        `${stem}.zotero-pdf-optimizer-original${suffix}.pdf`,
      );
      if (!(await this.fs.exists(candidate))) return candidate;
      index++;
    }
  }
}
