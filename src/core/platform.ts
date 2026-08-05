export type SupportedOS = "windows" | "macos" | "linux";
export type SupportedArch = "x64" | "arm64";

export function executableName(os: SupportedOS): "cpdf" | "cpdf.exe" {
  return os === "windows" ? "cpdf.exe" : "cpdf";
}

export function platformDirectory(
  os: SupportedOS,
  arch: SupportedArch,
): string {
  const prefix = os === "windows" ? "win" : os;
  return `${prefix}-${arch}`;
}

export function bundledRelativePath(
  os: SupportedOS,
  arch: SupportedArch,
): string {
  return `addon/bin/${platformDirectory(os, arch)}/${executableName(os)}`;
}

export function currentPlatform(): {
  os: SupportedOS;
  arch: SupportedArch;
} | null {
  const os: SupportedOS | null = Zotero.isWin
    ? "windows"
    : Zotero.isMac
      ? "macos"
      : Zotero.isLinux
        ? "linux"
        : null;
  if (!os) return null;

  const abi = Services.appinfo.XPCOMABI.toLowerCase();
  const arch =
    abi.includes("aarch64") || abi.includes("arm64")
      ? "arm64"
      : abi.includes("x86_64") || abi.includes("x64")
        ? "x64"
        : null;
  return arch ? { os, arch } : null;
}
