import { getSettings } from "./settings";

const PREFIX = "[Zotero PDF Optimizer]";

export function log(message: string, details?: unknown): void {
  Zotero.debug(`${PREFIX} ${message}`);
  if (details !== undefined && getSettings().debug) Zotero.debug(details);
}

export function debug(message: string, details?: unknown): void {
  if (!getSettings().debug) return;
  Zotero.debug(`${PREFIX} ${message}`);
  if (details !== undefined) Zotero.debug(details);
}

export function logError(
  stage: string,
  error: unknown,
  context?: object,
): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  Zotero.logError(
    new Error(
      `${PREFIX} stage=${stage} ${normalized.message}` +
        (context ? ` context=${JSON.stringify(context)}` : ""),
    ),
  );
}
