import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { Neo4jMemoryConfig } from "./config.js";

export type MemoryOnboardingStatus = {
  pluginId: string;
  configured: boolean;
  statusLines: string[];
  selectionHint?: string;
  isActive?: boolean;
};

export type MemoryOnboardingContext = {
  cfg: OpenClawConfig;
};

export type MemoryOnboardingConfigureContext = {
  cfg: OpenClawConfig;
  prompter: MemoryOnboardingPrompter;
};

export type MemoryOnboardingResult = {
  cfg: OpenClawConfig;
};

export type MemoryOnboardingPrompter = {
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

export type MemoryOnboardingAdapter = {
  pluginId: string;
  getStatus: (ctx: MemoryOnboardingContext) => Promise<MemoryOnboardingStatus>;
  configure: (ctx: MemoryOnboardingConfigureContext) => Promise<MemoryOnboardingResult>;
  disable?: (cfg: OpenClawConfig) => OpenClawConfig;
};

const MEMORY_SLOT_KEY = "memory";
const DEFAULT_MEMORY_PLUGIN = "memory-core";

function getPluginConfig(cfg: OpenClawConfig): Record<string, unknown> | undefined {
  return cfg.plugins?.entries?.["memory-neo4j"]?.config as Record<string, unknown> | undefined;
}

function getActiveMemoryPlugin(cfg: OpenClawConfig): string {
  return cfg.plugins?.slots?.memory ?? DEFAULT_MEMORY_PLUGIN;
}

function isNeo4jMemoryActive(cfg: OpenClawConfig): boolean {
  return getActiveMemoryPlugin(cfg) === "memory-neo4j";
}

function resolveConnectionConfig(
  pluginConfig: Record<string, unknown> | undefined,
): Neo4jMemoryConfig["connection"] {
  const conn = pluginConfig?.connection as Record<string, unknown> | undefined;
  return {
    uri: (conn?.uri as string) ?? "bolt://localhost:7687",
    username: (conn?.username as string) ?? "neo4j",
    password: (conn?.password as string) ?? "",
    database: (conn?.database as string) ?? "neo4j",
    maxConnectionPoolSize: (conn?.maxConnectionPoolSize as number) ?? 50,
    connectionTimeout: (conn?.connectionTimeout as number) ?? 30000,
  };
}

function isConfigured(pluginConfig: Record<string, unknown> | undefined): boolean {
  const conn = resolveConnectionConfig(pluginConfig);
  return Boolean(conn.uri && conn.username && conn.password);
}

function activateNeo4jMemorySlot(cfg: OpenClawConfig): OpenClawConfig {
  const entries = { ...cfg.plugins?.entries };

  if (entries["memory-core"]?.enabled !== false) {
    entries["memory-core"] = {
      ...entries["memory-core"],
      enabled: false,
    };
  }

  entries["memory-neo4j"] = {
    ...entries["memory-neo4j"],
    enabled: true,
  };

  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      slots: {
        ...cfg.plugins?.slots,
        [MEMORY_SLOT_KEY]: "memory-neo4j",
      },
      entries,
    },
  };
}

function updatePluginConfig(
  cfg: OpenClawConfig,
  patch: Record<string, unknown>,
): OpenClawConfig {
  const current = cfg.plugins?.entries?.["memory-neo4j"]?.config ?? {};
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      entries: {
        ...cfg.plugins?.entries,
        "memory-neo4j": {
          ...cfg.plugins?.entries?.["memory-neo4j"],
          enabled: true,
          config: {
            ...current,
            ...patch,
          },
        },
      },
    },
  };
}

async function testConnection(params: {
  uri: string;
  username: string;
  password: string;
  database: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Neo4jConnection } = await import("./db/connection.js");
    const connection = new Neo4jConnection({
      uri: params.uri,
      username: params.username,
      password: params.password,
      database: params.database,
    });
    await connection.initialize();
    await connection.close();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export const neo4jMemoryOnboardingAdapter: MemoryOnboardingAdapter = {
  pluginId: "memory-neo4j",

  getStatus: async ({ cfg }) => {
    const pluginConfig = getPluginConfig(cfg);
    const configured = isConfigured(pluginConfig);
    const conn = resolveConnectionConfig(pluginConfig);
    const isActive = isNeo4jMemoryActive(cfg);

    const statusLines: string[] = [];
    if (isActive && configured) {
      statusLines.push(`Neo4j Memory: active (${conn.uri})`);
    } else if (configured) {
      statusLines.push(`Neo4j Memory: configured but not active (${conn.uri})`);
    } else if (conn.uri && !conn.password) {
      statusLines.push("Neo4j Memory: needs password");
    } else {
      statusLines.push("Neo4j Memory: not configured");
    }

    return {
      pluginId: "memory-neo4j",
      configured,
      statusLines,
      selectionHint: isActive ? "active" : configured ? "inactive" : "needs connection",
      isActive,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const pluginConfig = getPluginConfig(cfg);
    const currentConn = resolveConnectionConfig(pluginConfig);
    const isActive = isNeo4jMemoryActive(cfg);
    const currentMemoryPlugin = getActiveMemoryPlugin(cfg);

    await prompter.note(
      [
        "Neo4j Memory Plugin Configuration",
        "",
        "This plugin provides graph-based memory with entity relationship extraction.",
        "It stores memories in a Neo4j graph database for multi-hop search and context.",
        "",
        "IMPORTANT: Only one memory plugin can be active at a time.",
        `Current active memory plugin: ${currentMemoryPlugin}`,
        "",
        "If you're using Neo4j Desktop:",
        "1. Create a new database or use an existing one",
        "2. Note the connection URI (usually bolt://localhost:7687)",
        "3. Use the username/password you set during database creation",
      ].join("\n"),
      "Neo4j Memory Setup",
    );

    const wantsConfig = await prompter.confirm({
      message: "Configure Neo4j memory plugin?",
      initialValue: !isConfigured(pluginConfig),
    });

    if (!wantsConfig) {
      return { cfg };
    }

    const uri = await prompter.text({
      message: "Neo4j connection URI",
      initialValue: currentConn.uri,
      placeholder: "bolt://localhost:7687",
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const username = await prompter.text({
      message: "Database username",
      initialValue: currentConn.username,
      placeholder: "neo4j",
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const password = await prompter.text({
      message: "Database password",
      placeholder: "your-secure-password",
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const database = await prompter.text({
      message: "Database name",
      initialValue: currentConn.database,
      placeholder: "neo4j",
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const testResult = await testConnection({
      uri: uri.trim(),
      username: username.trim(),
      password: password.trim(),
      database: database.trim(),
    });

    if (!testResult.ok) {
      await prompter.note(
        [
          "Connection test failed:",
          testResult.error ?? "Unknown error",
          "",
          "The configuration has been saved, but the plugin may not work correctly.",
          "Please verify your Neo4j connection settings.",
        ].join("\n"),
        "Connection Warning",
      );
    } else {
      await prompter.note(
        "Connection test successful! Neo4j memory plugin is ready to use.",
        "Connection OK",
      );
    }

    const modelStrategy = await prompter.select({
      message: "Model strategy for entity extraction",
      options: [
        {
          value: "hybrid",
          label: "Hybrid (recommended)",
          hint: "Use quick model for extraction, main model for complex analysis",
        },
        {
          value: "same-as-main",
          label: "Same as main model",
          hint: "Use the main LLM for all memory operations",
        },
        {
          value: "independent",
          label: "Independent",
          hint: "Configure separate models for memory operations",
        },
      ],
      initialValue: "hybrid",
    });

    const autoCapture = await prompter.confirm({
      message: "Enable automatic memory capture from conversations?",
      initialValue: true,
    });

    const autoRecall = await prompter.confirm({
      message: "Enable automatic memory recall before agent responses?",
      initialValue: true,
    });

    let next = updatePluginConfig(cfg, {
      connection: {
        uri: uri.trim(),
        username: username.trim(),
        password: password.trim(),
        database: database.trim(),
        maxConnectionPoolSize: 50,
        connectionTimeout: 30000,
      },
      models: {
        strategy: modelStrategy,
      },
      lifecycle: {
        autoCapture,
        autoRecall,
        recallLimit: 5,
      },
    });

    if (!isActive) {
      const activateNow = await prompter.confirm({
        message: `Switch to Neo4j memory plugin? (This will disable ${currentMemoryPlugin})`,
        initialValue: true,
      });

      if (activateNow) {
        next = activateNeo4jMemorySlot(next);
        await prompter.note(
          [
            "Neo4j Memory Plugin is now the active memory system.",
            `Previous memory plugin (${currentMemoryPlugin}) has been disabled.`,
          ].join("\n"),
          "Memory Slot Updated",
        );
      } else {
        await prompter.note(
          [
            "Configuration saved but Neo4j memory is not active.",
            `Current memory plugin: ${currentMemoryPlugin}`,
            "",
            "To activate Neo4j memory later:",
            '  Set plugins.slots.memory = "memory-neo4j" in openclaw.json',
          ].join("\n"),
          "Not Activated",
        );
      }
    }

    await prompter.note(
      [
        "Neo4j Memory Plugin configured successfully!",
        "",
        "Next steps:",
        "1. Restart the gateway: openclaw gateway run",
        "2. The plugin will automatically:",
        "   - Extract entities and relationships from conversations",
        "   - Store them in the Neo4j graph database",
        "   - Recall relevant memories in future conversations",
        "",
        "CLI commands:",
        "  openclaw memory-graph search <query>  - Search memories",
        "  openclaw memory-graph status          - Check plugin status",
        "",
        "Tools available to the agent:",
        "  memory_graph_search  - Search knowledge graph",
        "  memory_entity_add    - Add new entities",
        "  memory_relation_add  - Create relationships",
      ].join("\n"),
      "Setup Complete",
    );

    return { cfg: next };
  },

  disable: (cfg) => {
    const entries = { ...cfg.plugins?.entries };
    entries["memory-neo4j"] = {
      ...entries["memory-neo4j"],
      enabled: false,
    };

    if (cfg.plugins?.slots?.memory === "memory-neo4j") {
      entries["memory-core"] = {
        ...entries["memory-core"],
        enabled: true,
      };
    }

    return {
      ...cfg,
      plugins: {
        ...cfg.plugins,
        slots: {
          ...cfg.plugins?.slots,
          [MEMORY_SLOT_KEY]: DEFAULT_MEMORY_PLUGIN,
        },
        entries,
      },
    };
  },
};

export default neo4jMemoryOnboardingAdapter;
