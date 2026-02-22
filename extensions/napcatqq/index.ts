import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { napcatqqPlugin } from "./src/channel.js";
import { setNapCatQQRuntime } from "./src/runtime.js";

const plugin = {
  id: "napcatqq",
  name: "NapCatQQ",
  description: "NapCatQQ channel plugin with OneBot 11 protocol support",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setNapCatQQRuntime(api.runtime);
    api.registerChannel({ plugin: napcatqqPlugin as ChannelPlugin });
  },
};

export default plugin;
