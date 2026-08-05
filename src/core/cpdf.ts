export function buildOptimizeArgs(
  inputPath: string,
  outputPath: string,
  squeeze: boolean,
): string[] {
  if (!inputPath || !outputPath) {
    throw new Error("CPDF input and output paths are required");
  }
  if (inputPath === outputPath) {
    throw new Error("CPDF input and output paths must be different");
  }

  return [
    "-remove-dict-entry",
    "/PieceInfo",
    ...(squeeze ? ["-squeeze"] : []),
    inputPath,
    "-o",
    outputPath,
  ];
}

export function buildPageCountArgs(inputPath: string): string[] {
  if (!inputPath) throw new Error("CPDF input path is required");
  return ["-pages", inputPath];
}

export function parsePageCount(output: string): number | null {
  const match = output.trim().match(/^(\d+)$/);
  if (!match) return null;
  const pages = Number(match[1]);
  return Number.isSafeInteger(pages) && pages > 0 ? pages : null;
}

export const CPDF_VERSION_ARGS = ["-version"] as const;
