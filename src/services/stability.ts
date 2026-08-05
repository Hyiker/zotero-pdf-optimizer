import { snapshotsEqual } from "../core/logic";
import type { FileSnapshot, FileSystem } from "../core/types";

export const FILE_STABILITY_INTERVAL_MS = 1000;
export const FILE_STABILITY_TIMEOUT_MS = 30000;
export const FILE_STABILITY_REQUIRED_MATCHES = 2;

export class FileStabilityWaiter {
  constructor(
    private readonly fs: FileSystem,
    private readonly interval = FILE_STABILITY_INTERVAL_MS,
    private readonly timeout = FILE_STABILITY_TIMEOUT_MS,
    private readonly requiredMatches = FILE_STABILITY_REQUIRED_MATCHES,
  ) {}

  async wait(
    pathProvider: () => Promise<string | false>,
    cancelled: () => boolean,
  ): Promise<{ path: string; snapshot: FileSnapshot } | null> {
    const deadline = Date.now() + this.timeout;
    let previous: FileSnapshot | null = null;
    let stableMatches = 0;

    while (Date.now() <= deadline && !cancelled()) {
      const path = await pathProvider();
      if (path && (await this.fs.exists(path))) {
        try {
          const current = await this.fs.stat(path);
          if (snapshotsEqual(previous, current)) stableMatches++;
          else stableMatches = 0;
          previous = current;
          if (stableMatches >= this.requiredMatches) {
            return { path, snapshot: current };
          }
        } catch {
          previous = null;
          stableMatches = 0;
        }
      }
      await Zotero.Promise.delay(this.interval);
    }
    return null;
  }
}
