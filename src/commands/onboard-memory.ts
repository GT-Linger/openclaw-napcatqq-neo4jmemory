import type { OpenClawConfig } from "../config/config.js";
import { t } from "../i18n/index.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export type MemoryPluginStatus = {
  pluginId: string;
  configured: boolean;
  statusLines: string[];
  isActive?: boolean;
};

type MemoryPluginEntry = {
  id: string;
  label: string;
  getStatus: (cfg: OpenClawConfig) => Promise<MemoryPluginStatus>;
  configure: (cfg: OpenClawConfig, prompter: WizardPrompter, runtime: RuntimeEnv) => Promise<OpenClawConfig>;
};

type MemoryOnboardingAdapter = {
  pluginId: string;
  getStatus: (ctx: { cfg: OpenClawConfig }) => Promise<MemoryPluginStatus>;
  configure: (ctx: { cfg: OpenClawConfig; prompter: MemoryPrompterAdapter }) => Promise<{ cfg: OpenClawConfig }>;
};

type MemoryPrompterAdapter = {
  confirm: (params: { message: string; initialValue?: boolean }) => Promise<boolean>;
  text: (params: {
    message: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }) => Promise<string>;
  select: <T>(params: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
    initialValue?: T;
  }) => Promise<T>;
  note: (content: string, title?: string) => Promise<void>;
};

const DEFAULT_MEMORY_PLUGIN = "memory-core";

function adaptPrompter(prompter: WizardPrompter): MemoryPrompterAdapter {
  return {
    confirm: (params) => prompter.confirm(params),
    text: (params) => prompter.text(params),
    select: (params) => prompter.select(params),
    note: (content, title) => prompter.note(content, title),
  };
}

function getActiveMemoryPlugin(cfg: OpenClawConfig): string {
  return cfg.plugins?.slots?.memory ?? DEFAULT_MEMORY_PLUGIN;
}

const memoryPlugins: MemoryPluginEntry[] = [
  {
    id: DEFAULT_MEMORY_PLUGIN,
    label: "Memory Core (built-in)",
    getStatus: async (cfg) => {
      const isActive = getActiveMemoryPlugin(cfg) === DEFAULT_MEMORY_PLUGIN;
      return {
        pluginId: DEFAULT_MEMORY_PLUGIN,
        configured: true,
        statusLines: [
          isActive
            ? t("memory.core.active")
            : t("memory.core.inactive"),
        ],
        isActive,
      };
    },
    configure: async (cfg, prompter, _runtime) => {
      const isActive = getActiveMemoryPlugin(cfg) === DEFAULT_MEMORY_PLUGIN;
      if (isActive) {
        await prompter.note(
          t("memory.core.description"),
          t("memory.core.name"),
        );
        return cfg;
      }

      const activate = await prompter.confirm({
        message: t("memory.core.switchQuestion"),
        initialValue: true,
      });

      if (!activate) {
        return cfg;
      }

      const entries = { ...cfg.plugins?.entries };
      entries[DEFAULT_MEMORY_PLUGIN] = { ...entries[DEFAULT_MEMORY_PLUGIN], enabled: true };

      const activePlugin = getActiveMemoryPlugin(cfg);
      if (activePlugin !== DEFAULT_MEMORY_PLUGIN) {
        entries[activePlugin] = { ...entries[activePlugin], enabled: false };
      }

      return {
        ...cfg,
        plugins: {
          ...cfg.plugins,
          slots: {
            ...cfg.plugins?.slots,
            memory: DEFAULT_MEMORY_PLUGIN,
          },
          entries,
        },
      };
    },
  },
];

let pluginsLoaded = false;

async function loadMemoryPlugins(): Promise<void> {
  if (pluginsLoaded) {
    return;
  }

  try {
    const neo4jModule = await import("../../extensions/memory-neo4j/index.js");
    const adapter = neo4jModule.neo4jMemoryOnboardingAdapter as MemoryOnboardingAdapter | undefined;
    if (adapter) {
      memoryPlugins.push({
        id: adapter.pluginId,
        label: t("memory.neo4j.name"),
        getStatus: (cfg) => adapter.getStatus({ cfg }),
        configure: (cfg, prompter, _runtime) =>
          adapter.configure({ cfg, prompter: adaptPrompter(prompter) }).then((r) => r.cfg),
      });
    }
  } catch {
    // Plugin not available
  }

  pluginsLoaded = true;
}

export function registerMemoryPlugin(entry: MemoryPluginEntry): void {
  const existing = memoryPlugins.find((p) => p.id === entry.id);
  if (existing) {
    const idx = memoryPlugins.indexOf(existing);
    memoryPlugins[idx] = entry;
  } else {
    memoryPlugins.push(entry);
  }
}

export function listMemoryPlugins(): MemoryPluginEntry[] {
  return [...memoryPlugins];
}

export async function getMemoryPluginStatus(cfg: OpenClawConfig): Promise<MemoryPluginStatus[]> {
  await loadMemoryPlugins();
  return Promise.all(memoryPlugins.map((plugin) => plugin.getStatus(cfg)));
}

export async function setupMemory(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  await loadMemoryPlugins();

  const statuses = await getMemoryPluginStatus(cfg);
  const activePlugin = getActiveMemoryPlugin(cfg);

  if (statuses.length === 0) {
    await prompter.note(t("memory.noPlugins"), t("memory.title"));
    return cfg;
  }

  const statusLines = statuses.flatMap((s) => s.statusLines);
  await prompter.note(
    [
      t("memory.statusTitle"),
      "",
      ...statusLines,
      "",
      t("memory.noteExclusive"),
      t("memory.currentActive", { plugin: activePlugin }),
    ].join("\n"),
    t("memory.plugins"),
  );

  const shouldConfigure = await prompter.confirm({
    message: t("memory.configureQuestion"),
    initialValue: false,
  });

  if (!shouldConfigure) {
    return cfg;
  }

  const unconfigured = statuses.filter((s) => !s.configured && s.pluginId !== DEFAULT_MEMORY_PLUGIN);

  if (unconfigured.length > 0) {
    const configureNew = await prompter.confirm({
      message: t("memory.configureQuestion") + ` (${unconfigured[0].pluginId})`,
      initialValue: true,
    });

    if (configureNew) {
      const plugin = memoryPlugins.find((p) => p.id === unconfigured[0].pluginId);
      if (plugin) {
        return plugin.configure(cfg, prompter, runtime);
      }
    }
  }

  const options = memoryPlugins.map((plugin) => {
    const status = statuses.find((s) => s.pluginId === plugin.id);
    const isActive = status?.isActive ?? false;
    const isConfigured = status?.configured ?? false;

    let hint = "";
    if (isActive) {
      hint = t("memory.neo4j.hintActive");
    } else if (!isConfigured && plugin.id !== DEFAULT_MEMORY_PLUGIN) {
      hint = t("memory.neo4j.hintNotConfigured");
    } else {
      hint = t("memory.neo4j.hintAvailable");
    }

    return {
      value: plugin.id,
      label: plugin.label,
      hint,
    };
  });

  const selected = await prompter.select({
    message: t("memory.selectPlugin"),
    options,
    initialValue: activePlugin,
  });

  const plugin = memoryPlugins.find((p) => p.id === selected);
  if (!plugin) {
    return cfg;
  }

  return plugin.configure(cfg, prompter, runtime);
}
