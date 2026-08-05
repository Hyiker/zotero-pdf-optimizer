import { executableName, currentPlatform } from "../core/platform";
import type { ResolvedCPDF } from "../core/types";
import { getSubprocess } from "./processRunner";

export interface BundledCPDFProvider {
  getExecutablePath(): Promise<string | null>;
}

class NoBundledCPDF implements BundledCPDFProvider {
  async getExecutablePath(): Promise<null> {
    // A future implementation must extract the XPI resource to a writable cache
    // and set executable permissions. XPI resources are never run directly.
    return null;
  }
}

export class CPDFResolver {
  constructor(
    private readonly bundled: BundledCPDFProvider = new NoBundledCPDF(),
  ) {}

  async resolve(customPath: string): Promise<ResolvedCPDF | null> {
    const trimmed = customPath.trim();
    if (trimmed && (await this.isRegularFile(trimmed))) {
      return { path: trimmed, source: "custom" };
    }

    const bundled = await this.bundled.getExecutablePath();
    if (bundled && (await this.isRegularFile(bundled))) {
      return { path: bundled, source: "bundled" };
    }

    const platform = currentPlatform();
    if (!platform) return null;
    try {
      const path = await getSubprocess().pathSearch(
        executableName(platform.os),
      );
      return path ? { path, source: "path" } : null;
    } catch {
      return null;
    }
  }

  private async isRegularFile(path: string): Promise<boolean> {
    try {
      const info = await IOUtils.stat(path);
      return info.type === "regular";
    } catch {
      return false;
    }
  }
}
