import type { FileSnapshot, FileSystem } from "../core/types";

export class ZoteroFileSystem implements FileSystem {
  exists(path: string): Promise<boolean> {
    return IOUtils.exists(path);
  }

  async stat(path: string): Promise<FileSnapshot> {
    const info = await IOUtils.stat(path);
    if (info.type !== "regular" || info.size === undefined) {
      throw new Error(`Not a regular file: ${path}`);
    }
    return { size: info.size, mtime: info.lastModified ?? 0 };
  }

  move(source: string, destination: string): Promise<void> {
    return IOUtils.move(source, destination, { noOverwrite: true });
  }

  copy(source: string, destination: string): Promise<void> {
    return IOUtils.copy(source, destination, { noOverwrite: true });
  }

  remove(path: string): Promise<void> {
    return IOUtils.remove(path, { ignoreAbsent: true, retryReadonly: true });
  }
}
