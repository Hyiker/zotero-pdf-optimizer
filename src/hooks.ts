import { initLocale, getString } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { PluginController } from "./services/controller";
import { optimizeSelectedPDFs } from "./services/manualOptimization";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  initLocale();
  addon.data.preferencePaneID = await Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
  addon.data.controller = new PluginController();
  addon.data.controller.start();
  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  const toolkit = createZToolkit();
  addon.data.ztoolkit = toolkit;
  addon.data.ztoolkits.push(toolkit);
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
  toolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${addon.data.config.addonRef}-optimize-pdf`,
    label: getString("optimize-selected-pdf"),
    commandListener: () => void optimizeSelectedPDFs(),
  });
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  // Window-owned DOM registrations are released by the toolkit at shutdown.
}

async function onShutdown(): Promise<void> {
  addon.data.alive = false;
  addon.data.controller?.shutdown();
  addon.data.controller = undefined;
  for (const toolkit of addon.data.ztoolkits) toolkit.unregisterAll();
  addon.data.ztoolkits = [];
  if (addon.data.preferencePaneID) {
    Zotero.PreferencePanes.unregister(addon.data.preferencePaneID);
    addon.data.preferencePaneID = undefined;
  }
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onPrefsEvent(type: string, data: { window: Window }) {
  if (type === "load") await registerPrefsScripts(data.window);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
