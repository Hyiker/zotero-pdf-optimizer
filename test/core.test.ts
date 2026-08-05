import { assert } from "chai";
import {
  buildOptimizeArgs,
  buildPageCountArgs,
  parsePageCount,
} from "../src/core/cpdf";
import {
  calculateSavings,
  classifyResult,
  isEligiblePDF,
  meetsMinimumSavings,
  snapshotsEqual,
  TaskDeduplicator,
} from "../src/core/logic";
import {
  bundledRelativePath,
  executableName,
  platformDirectory,
} from "../src/core/platform";

describe("core logic", function () {
  it("builds CPDF argument arrays without shell concatenation", function () {
    assert.deepEqual(
      buildOptimizeArgs("C:\\中文 a.pdf", "C:\\输出 b.pdf", true),
      [
        "-remove-dict-entry",
        "/PieceInfo",
        "-squeeze",
        "C:\\中文 a.pdf",
        "-o",
        "C:\\输出 b.pdf",
      ],
    );
    assert.deepEqual(buildOptimizeArgs("in.pdf", "out.pdf", false), [
      "-remove-dict-entry",
      "/PieceInfo",
      "in.pdf",
      "-o",
      "out.pdf",
    ]);
    assert.throws(() => buildOptimizeArgs("same.pdf", "same.pdf", true));
    assert.deepEqual(buildPageCountArgs("a b.pdf"), ["-pages", "a b.pdf"]);
    assert.equal(parsePageCount(" 12\n"), 12);
    assert.isNull(parsePageCount("pages: 12"));
  });

  it("resolves executable names and all platform directories", function () {
    assert.equal(executableName("windows"), "cpdf.exe");
    assert.equal(executableName("macos"), "cpdf");
    assert.equal(executableName("linux"), "cpdf");
    assert.equal(platformDirectory("windows", "x64"), "win-x64");
    assert.equal(platformDirectory("windows", "arm64"), "win-arm64");
    assert.equal(platformDirectory("macos", "x64"), "macos-x64");
    assert.equal(platformDirectory("macos", "arm64"), "macos-arm64");
    assert.equal(platformDirectory("linux", "x64"), "linux-x64");
    assert.equal(platformDirectory("linux", "arm64"), "linux-arm64");
    assert.equal(
      bundledRelativePath("windows", "x64"),
      "addon/bin/win-x64/cpdf.exe",
    );
  });

  it("checks PDF attachment eligibility", function () {
    assert.isTrue(
      isEligiblePDF({
        isAttachment: true,
        isFileAttachment: true,
        contentType: "application/pdf",
        path: false,
      }),
    );
    assert.isTrue(
      isEligiblePDF({
        isAttachment: true,
        isFileAttachment: true,
        contentType: "application/octet-stream",
        path: "/tmp/PAPER.PDF",
      }),
    );
    assert.isFalse(
      isEligiblePDF({
        isAttachment: true,
        isFileAttachment: false,
        contentType: "application/pdf",
        path: "https://example.com/paper.pdf",
      }),
    );
  });

  it("detects stable snapshots", function () {
    assert.isTrue(
      snapshotsEqual({ size: 10, mtime: 20 }, { size: 10, mtime: 20 }),
    );
    assert.isFalse(
      snapshotsEqual({ size: 10, mtime: 20 }, { size: 11, mtime: 20 }),
    );
    assert.isFalse(snapshotsEqual(null, { size: 10, mtime: 20 }));
  });

  it("calculates savings and requires both thresholds", function () {
    assert.deepEqual(calculateSavings(1000, 800), {
      savedBytes: 200,
      savedPercent: 20,
    });
    assert.isTrue(meetsMinimumSavings(1000, 800, 200, 20));
    assert.isFalse(meetsMinimumSavings(1000, 800, 201, 20));
    assert.isFalse(meetsMinimumSavings(1000, 800, 200, 20.1));
  });

  it("deduplicates queued, processing, and recent tasks", function () {
    const dedupe = new TaskDeduplicator(1000);
    assert.isTrue(dedupe.reserve(1));
    assert.isFalse(dedupe.reserve(1));
    dedupe.start(1);
    assert.isFalse(dedupe.reserve(1));
    dedupe.finish(1);
    assert.isTrue(dedupe.reserve(1));
    dedupe.remember("signature", 100);
    assert.isTrue(dedupe.wasRecent("signature", 1000));
    assert.isFalse(dedupe.wasRecent("signature", 1200));
  });

  it("classifies structured results", function () {
    assert.equal(classifyResult(1).status, "optimized");
    assert.equal(classifyResult(1, "not-pdf").status, "skipped");
    assert.equal(classifyResult(1, "cpdf-failed").status, "failed");
    assert.equal(classifyResult(1, "shutdown").status, "cancelled");
  });
});
