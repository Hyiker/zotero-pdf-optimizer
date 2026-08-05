import {
  buildOptimizeArgs,
  buildPageCountArgs,
  CPDF_VERSION_ARGS,
  parsePageCount,
} from "../core/cpdf";
import type { ProcessResult } from "../core/types";
import { debug } from "./logger";
import { ProcessRunner } from "./processRunner";

export interface PDFProcessor {
  readonly executablePath?: string;
  optimize(
    inputPath: string,
    outputPath: string,
    squeeze: boolean,
  ): Promise<ProcessResult>;
  pageCount(path: string): Promise<number | null>;
}

export class CPDFRunner implements PDFProcessor {
  constructor(
    readonly executablePath: string,
    private readonly processes: ProcessRunner,
  ) {}

  optimize(
    inputPath: string,
    outputPath: string,
    squeeze: boolean,
  ): Promise<ProcessResult> {
    const args = buildOptimizeArgs(inputPath, outputPath, squeeze);
    debug("Running CPDF optimization", {
      executable: this.executablePath,
      args,
    });
    return this.processes.run(this.executablePath, args);
  }

  async pageCount(path: string): Promise<number | null> {
    const result = await this.processes.run(
      this.executablePath,
      buildPageCountArgs(path),
    );
    return result.exitCode === 0 ? parsePageCount(result.stdout) : null;
  }

  version(): Promise<ProcessResult> {
    return this.processes.run(this.executablePath, CPDF_VERSION_ARGS);
  }
}
