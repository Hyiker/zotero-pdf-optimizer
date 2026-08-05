import { assert } from "chai";
import { CPDFRunner } from "../src/services/cpdfRunner";
import { ProcessRunner } from "../src/services/processRunner";

describe("CPDF integration", function () {
  it("optimizes a fixture and preserves its page count when CPDF_PATH is set", async function () {
    this.timeout(30000);
    const environment = Cc["@mozilla.org/process/environment;1"].getService(
      Ci.nsIEnvironment,
    );
    const cpdfPath = environment.get("CPDF_PATH");
    if (!cpdfPath) this.skip();

    const id = Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
    const input = PathUtils.join(PathUtils.tempDir, `zpo-${id}-input.pdf`);
    const output = PathUtils.join(PathUtils.tempDir, `zpo-${id}-output.pdf`);
    const fixture = await Zotero.File.getResourceAsync(
      `${addon.data.rootURI}content/test-fixtures/minimal.pdf`,
    );
    await IOUtils.writeUTF8(input, fixture);

    const processes = new ProcessRunner(10000);
    const runner = new CPDFRunner(cpdfPath, processes);
    try {
      const version = await runner.version();
      assert.equal(version.exitCode, 0, version.stderr);
      const before = await runner.pageCount(input);
      const processed = await runner.optimize(input, output, true);
      assert.equal(processed.exitCode, 0, processed.stderr);
      assert.isTrue(await IOUtils.exists(output));
      assert.equal(await runner.pageCount(output), before);
      assert.equal(before, 1);
    } finally {
      processes.shutdown();
      await IOUtils.remove(input, { ignoreAbsent: true });
      await IOUtils.remove(output, { ignoreAbsent: true });
    }
  });
});
