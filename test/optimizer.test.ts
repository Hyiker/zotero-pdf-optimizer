import { assert } from "chai";
import { FileReplacementService } from "../src/core/fileReplacement";
import type {
  FileSnapshot,
  FileSystem,
  OptimizerSettings,
  ProcessResult,
} from "../src/core/types";
import type { PDFProcessor } from "../src/services/cpdfRunner";
import { PDFOptimizerService } from "../src/services/pdfOptimizer";
import { FileStabilityWaiter } from "../src/services/stability";

class MemoryFS implements FileSystem {
  files = new Map<string, FileSnapshot>();
  moves: Array<[string, string]> = [];
  failMove?: (source: string, destination: string) => boolean;

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
  stat(path: string): Promise<FileSnapshot> {
    const value = this.files.get(path);
    if (!value) return Promise.reject(new Error(`Missing: ${path}`));
    return Promise.resolve({ ...value });
  }
  move(source: string, destination: string): Promise<void> {
    this.moves.push([source, destination]);
    if (this.failMove?.(source, destination)) {
      return Promise.reject(new Error("injected move failure"));
    }
    const value = this.files.get(source);
    if (!value || this.files.has(destination)) {
      return Promise.reject(new Error("invalid move"));
    }
    this.files.delete(source);
    this.files.set(destination, value);
    return Promise.resolve();
  }
  copy(source: string, destination: string): Promise<void> {
    const value = this.files.get(source);
    if (!value) return Promise.reject(new Error("invalid copy"));
    this.files.set(destination, { ...value });
    return Promise.resolve();
  }
  remove(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }
}

class FakeProcessor implements PDFProcessor {
  pages: Array<number | null> = [10, 10];
  process: ProcessResult = { exitCode: 0, stdout: "", stderr: "" };
  outputSize = 700;
  constructor(private readonly fs: MemoryFS) {}
  optimize(_input: string, output: string): Promise<ProcessResult> {
    if (this.process.exitCode === 0) {
      this.fs.files.set(output, { size: this.outputSize, mtime: 2 });
    }
    return Promise.resolve(this.process);
  }
  pageCount(): Promise<number | null> {
    return Promise.resolve(this.pages.shift() ?? null);
  }
}

const settings: OptimizerSettings = {
  automatic: true,
  cpdfPath: "cpdf",
  squeeze: true,
  minSavingsPercent: 1,
  minSavingsBytes: 1,
  notifications: true,
  keepBackup: false,
  debug: false,
};

function fixture() {
  const fs = new MemoryFS();
  fs.files.set("C:\\docs\\paper.pdf", { size: 1000, mtime: 1 });
  const processor = new FakeProcessor(fs);
  const service = new PDFOptimizerService(
    {
      fs,
      runner: processor,
      replacement: new FileReplacementService(fs),
      uuid: () => "test-id",
    },
    new FileStabilityWaiter(fs, 0, 0, 0),
  );
  return { fs, processor, service };
}

describe("optimizer safety", function () {
  it("does not replace when CPDF fails", async function () {
    const { fs, processor, service } = fixture();
    processor.process = { exitCode: 2, stdout: "", stderr: "encrypted" };
    const result = await service.optimizePath(
      1,
      "C:\\docs\\paper.pdf",
      settings,
    );
    assert.equal(result.reason, "cpdf-failed");
    assert.lengthOf(fs.moves, 0);
    assert.equal((await fs.stat("C:\\docs\\paper.pdf")).size, 1000);
  });

  it("does not replace when page counts differ", async function () {
    const { fs, processor, service } = fixture();
    processor.pages = [10, 9];
    const result = await service.optimizePath(
      1,
      "C:\\docs\\paper.pdf",
      settings,
    );
    assert.equal(result.reason, "page-count-changed");
    assert.lengthOf(fs.moves, 0);
  });

  it("does not replace when output is larger", async function () {
    const { fs, processor, service } = fixture();
    processor.outputSize = 1100;
    const result = await service.optimizePath(
      1,
      "C:\\docs\\paper.pdf",
      settings,
    );
    assert.equal(result.reason, "not-smaller");
    assert.lengthOf(fs.moves, 0);
  });

  it("rolls back when replacement fails", async function () {
    const fs = new MemoryFS();
    const original = "C:\\docs\\paper.pdf";
    const output = "C:\\docs\\.paper.output.pdf";
    const backup = "C:\\docs\\.paper.backup.pdf";
    fs.files.set(original, { size: 1000, mtime: 1 });
    fs.files.set(output, { size: 700, mtime: 2 });
    fs.failMove = (source, destination) =>
      source === output && destination === original;
    try {
      await new FileReplacementService(fs).replace(
        original,
        output,
        backup,
        false,
      );
      assert.fail("replacement should fail");
    } catch (error) {
      assert.equal(
        error instanceof Error && "rollbackCompleted" in error
          ? error.rollbackCompleted
          : false,
        true,
      );
    }
    assert.equal((await fs.stat(original)).size, 1000);
    assert.isFalse(await fs.exists(backup));
  });
});
