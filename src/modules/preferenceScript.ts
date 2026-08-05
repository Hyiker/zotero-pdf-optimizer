import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { setCPDFPath } from "../services/settings";

const id = (suffix: string) => `zotero-prefpane-${config.addonRef}-${suffix}`;

export async function registerPrefsScripts(window: Window): Promise<void> {
  addon.data.prefs = { window };
  const doc = window.document;
  const pathInput = doc.getElementById(id("cpdf-path")) as HTMLInputElement;
  const bytesInput = doc.getElementById(
    id("min-savings-kib"),
  ) as HTMLInputElement;
  pathInput.value = getPref("cpdfPath");
  bytesInput.value = String(Math.round(getPref("minSavingsBytes") / 1024));

  pathInput.addEventListener("change", () => setCPDFPath(pathInput.value));
  bytesInput.addEventListener("change", () => {
    const kib = Number(bytesInput.value);
    if (Number.isFinite(kib) && kib >= 0) {
      setPref("minSavingsBytes", Math.round(kib * 1024));
    }
  });

  doc.getElementById(id("choose"))?.addEventListener("command", async () => {
    const path = await new ztoolkit.FilePicker(
      getString("choose-cpdf-title"),
      "open",
      [[getString("cpdf-file-filter"), Zotero.isWin ? "*.exe" : "*"]],
      Zotero.isWin ? "cpdf.exe" : "cpdf",
      window,
    ).open();
    if (path) {
      pathInput.value = path;
      setCPDFPath(path);
      setStatus(window, path);
    }
  });

  doc.getElementById(id("detect"))?.addEventListener("command", async () => {
    setStatus(window, getString("detecting-cpdf"));
    const path = await addon.data.controller!.detectCPDF("");
    if (path) {
      pathInput.value = path;
      setCPDFPath(path);
      setStatus(window, `${getString("cpdf-found")} ${path}`);
    } else {
      setStatus(window, getString("cpdf-not-found"));
    }
  });

  doc.getElementById(id("test"))?.addEventListener("command", async () => {
    setCPDFPath(pathInput.value);
    setStatus(window, getString("testing-cpdf"));
    const tested = await addon.data.controller!.testCPDF(pathInput.value);
    setStatus(
      window,
      [
        tested.found ? getString("cpdf-found") : getString("cpdf-not-found"),
        tested.path,
        tested.version,
        tested.error,
      ]
        .filter(Boolean)
        .join("\n"),
      Boolean(tested.error),
    );
  });
}

function setStatus(window: Window, message: string, error = false): void {
  const element = window.document.getElementById(id("cpdf-status"));
  if (element) {
    element.textContent = message;
    element.setAttribute("data-error", String(error));
  }
}
