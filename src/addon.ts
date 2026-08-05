import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { PluginController } from "./services/controller";

class Addon {
  public data: {
    alive: boolean;
    rootURI: string;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    ztoolkits: ZToolkit[];
    controller?: PluginController;
    preferencePaneID?: string;
    locale?: {
      current: any;
    };
    prefs?: { window: Window };
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      rootURI,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      ztoolkits: [],
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
