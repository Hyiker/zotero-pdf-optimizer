import type { OptimizationQueue } from "./optimizationQueue";
import { getSettings } from "./settings";
import { debug } from "./logger";

export class AttachmentWatcher {
  private observerID?: string;

  constructor(private readonly queue: OptimizationQueue) {}

  start(): void {
    if (this.observerID) return;
    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: async (event, type, ids, extraData) => {
          if (!addon.data.alive || !["add", "modify"].includes(event)) return;
          if (type !== "item" && type !== "file") return;
          const settings = getSettings();
          if (!settings.automatic) return;
          debug("Attachment event", { event, type, ids, extraData });
          for (const rawID of ids) {
            const id = Number(rawID);
            if (Number.isSafeInteger(id) && id > 0) {
              void this.queue.enqueue(id, false, settings);
            }
          }
        },
      },
      ["item", "file"],
      `${addon.data.config.addonRef}-attachment-watcher`,
    );
  }

  stop(): void {
    if (this.observerID) Zotero.Notifier.unregisterObserver(this.observerID);
    this.observerID = undefined;
  }
}
