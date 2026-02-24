import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentEntries,
  resolveAgentWorkspaceDir,
} from "../agents/agent-scope.js";
import type { AgentConfig } from "../config/types.agents.js";
import type { IdentityConfig } from "../config/types.base.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../routing/session-key.js";
import { applyAgentConfig, findAgentEntryIndex } from "./agents.config.js";

const PREDEFINED_AGENT_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  suggestedModel?: string;
  identity?: IdentityConfig;
  tools?: AgentConfig["tools"];
}> = [
  {
    id: "search",
    name: "Search Expert",
    description: "Handle web search, information gathering and summarization tasks",
    identity: { name: "Explorer", emoji: "🔍" },
    tools: { profile: "minimal", allow: ["web_search", "web_fetch", "read"] },
  },
  {
    id: "writing",
    name: "Writing Expert",
    description: "Handle creative writing, article drafting, script writing tasks",
    identity: { name: "Ella", emoji: "✒️" },
    tools: { profile: "minimal", allow: ["read", "write", "edit"] },
  },
  {
    id: "coding",
    name: "Coding Expert",
    description: "Handle coding, debugging, refactoring and technical tasks",
    identity: { name: "Coder", emoji: "💻" },
    tools: { profile: "coding" },
  },
  {
    id: "analysis",
    name: "Analysis Expert",
    description: "Handle data analysis, report generation, chart creation tasks",
    identity: { name: "Analyst", emoji: "📊" },
    tools: { profile: "coding" },
  },
];

type SubagentConfig = AgentConfig["subagents"];

function getAgentsList(cfg: OpenClawConfig): AgentConfig[] {
  return listAgentEntries(cfg);
}

async function ensureWorkspaceDir(workspace: string, runtime: RuntimeEnv): Promise<void> {
  try {
    await fs.mkdir(workspace, { recursive: true });
  } catch (err) {
    runtime.error?.(`Failed to create workspace: ${workspace}`);
    throw err;
  }
}

async function createAgentSoulFile(workspace: string, identity?: IdentityConfig): Promise<void> {
  const soulPath = path.join(workspace, "SOUL.md");
  try {
    await fs.access(soulPath);
    return;
  } catch {
    // File doesn't exist, create it
  }

  const identityName = identity?.name || "a professional assistant";
  const identityEmoji = identity?.emoji ? ` ${identity.emoji}` : "";

  const content = `# SOUL.md

## Who I Am

I am ${identityName}${identityEmoji}.

## My Expertise

Please edit this file to define my professional capabilities and working style.

## Working Principles

1. Focus on assigned tasks
2. Deliver high-quality output
3. Stay professional and efficient
`;

  await fs.writeFile(soulPath, content, "utf-8");
}

async function promptForAgentConfig(params: {
  prompter: WizardPrompter;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  existingId?: string;
}): Promise<AgentConfig | null> {
  const { prompter, cfg, runtime, existingId } = params;

  const isEditing = Boolean(existingId);

  const name = await prompter.text({
    message: isEditing ? "Agent name" : "New agent name",
    initialValue: existingId ?? "",
    placeholder: "e.g., search, writing, coding",
    validate: (value) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return "Name cannot be empty";
      }
      const normalized = normalizeAgentId(trimmed);
      if (normalized === DEFAULT_AGENT_ID) {
        return `"${DEFAULT_AGENT_ID}" is reserved, please choose another name`;
      }
      if (!isEditing && findAgentEntryIndex(getAgentsList(cfg), normalized) >= 0) {
        return `Agent "${normalized}" already exists`;
      }
      return undefined;
    },
  });

  const agentId = normalizeAgentId(name);
  const displayName = name.trim();

  const defaultWorkspace = resolveAgentWorkspaceDir(cfg, agentId);
  const workspaceInput = await prompter.text({
    message: "Workspace path",
    initialValue: defaultWorkspace,
    placeholder: `Default: ${defaultWorkspace}`,
  });

  const workspace = workspaceInput.trim() || defaultWorkspace;

  const useTemplate = await prompter.confirm({
    message: "Use a predefined template?",
    initialValue: false,
  });

  let selectedTemplate: (typeof PREDEFINED_AGENT_TEMPLATES)[number] | undefined;
  if (useTemplate) {
    const templateOptions = PREDEFINED_AGENT_TEMPLATES.map((t) => ({
      value: t.id,
      label: `${t.name} (${t.id})`,
      hint: t.description,
    }));

    const selectedId = await prompter.select({
      message: "Select agent template",
      options: templateOptions,
    });

    selectedTemplate = PREDEFINED_AGENT_TEMPLATES.find((t) => t.id === selectedId);
  }

  const configureIdentity = await prompter.confirm({
    message: "Configure agent identity/personality?",
    initialValue: true,
  });

  let identity: IdentityConfig | undefined = selectedTemplate?.identity;
  if (configureIdentity) {
    const identityName = await prompter.text({
      message: "Identity name",
      initialValue: identity?.name ?? "",
      placeholder: "e.g., Ella, Explorer",
    });

    const identityEmoji = await prompter.text({
      message: "Identity emoji",
      initialValue: identity?.emoji ?? "",
      placeholder: "e.g., ✒️, 🔍, 💻",
    });

    if (identityName.trim() || identityEmoji.trim()) {
      identity = {
        name: identityName.trim() || undefined,
        emoji: identityEmoji.trim() || undefined,
      };
    }
  }

  const configureSubagents = await prompter.confirm({
    message: "Configure sub-agent permissions?",
    initialValue: false,
  });

  let subagents: SubagentConfig | undefined;
  if (configureSubagents) {
    const existingAgents = getAgentsList(cfg)
      .filter((a) => normalizeAgentId(a.id) !== agentId)
      .map((a) => a.id);

    const allowAny = await prompter.confirm({
      message: "Allow creating any type of sub-agent?",
      initialValue: true,
    });

    if (allowAny) {
      subagents = { allowAgents: ["*"] };
    } else if (existingAgents.length > 0) {
      const selectedAgents = await prompter.select({
        message: "Select allowed sub-agent types",
        options: [
          { value: "*", label: "All agents", hint: "Allow creating any type" },
          ...existingAgents.map((id) => ({
            value: id,
            label: id,
            hint: `Allow creating ${id} type sub-agents`,
          })),
        ],
      });

      subagents = { allowAgents: [selectedAgents] };
    }
  }

  const agentConfig: AgentConfig = {
    id: agentId,
    name: displayName,
    workspace,
    identity,
    subagents,
    tools: selectedTemplate?.tools,
  };

  await ensureWorkspaceDir(resolveUserPath(workspace), runtime);
  await createAgentSoulFile(resolveUserPath(workspace), identity);

  return agentConfig;
}

async function configureSubagentDefaults(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const { cfg, prompter } = params;

  await prompter.note(
    [
      "Sub-agent Global Configuration",
      "",
      "These settings apply to all sub-agents' default behavior.",
      "",
      "Current settings:",
      `- Max nesting depth: ${cfg.agents?.defaults?.subagents?.maxSpawnDepth ?? 1}`,
      `- Max children per agent: ${cfg.agents?.defaults?.subagents?.maxChildrenPerAgent ?? 5}`,
      `- Max concurrent: ${cfg.agents?.defaults?.subagents?.maxConcurrent ?? 8}`,
    ].join("\n"),
    "Sub-agent Configuration"
  );

  const configureDefaults = await prompter.confirm({
    message: "Modify sub-agent global configuration?",
    initialValue: false,
  });

  if (!configureDefaults) {
    return cfg;
  }

  const maxSpawnDepth = await prompter.text({
    message: "Max nesting depth (1-5)",
    initialValue: String(cfg.agents?.defaults?.subagents?.maxSpawnDepth ?? 1),
  });

  const maxChildrenPerAgent = await prompter.text({
    message: "Max children per agent (1-20)",
    initialValue: String(cfg.agents?.defaults?.subagents?.maxChildrenPerAgent ?? 5),
  });

  const maxConcurrent = await prompter.text({
    message: "Max concurrent sub-agents",
    initialValue: String(cfg.agents?.defaults?.subagents?.maxConcurrent ?? 8),
  });

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        subagents: {
          ...cfg.agents?.defaults?.subagents,
          maxSpawnDepth: Math.min(5, Math.max(1, parseInt(maxSpawnDepth, 10) || 1)),
          maxChildrenPerAgent: Math.min(20, Math.max(1, parseInt(maxChildrenPerAgent, 10) || 5)),
          maxConcurrent: Math.max(1, parseInt(maxConcurrent, 10) || 8),
        },
      },
    },
  };
}

export async function setupAgents(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const agents = getAgentsList(cfg);
  const hasMultipleAgents = agents.length > 1;

  const statusLines: string[] = [
    `Current agent count: ${agents.length || 1}`,
    "",
    "Agent list:",
  ];

  if (agents.length > 0) {
    for (const agent of agents) {
      const isDefault = agent.default ? " (default)" : "";
      const identityName = agent.identity?.name ?? agent.name ?? agent.id;
      const identityEmoji = agent.identity?.emoji ? ` ${agent.identity.emoji}` : "";
      statusLines.push(`  - ${identityName}${identityEmoji} [${agent.id}]${isDefault}`);
    }
  } else {
    statusLines.push(`  - Main agent (default)`);
  }

  statusLines.push("");
  statusLines.push("Multi-agent architecture allows different task types to be handled by specialized agents.");
  statusLines.push("For example: search tasks by search experts, writing tasks by writing experts.");

  await prompter.note(statusLines.join("\n"), "Multi-agent Configuration");

  const shouldConfigure = await prompter.confirm({
    message: "Configure multi-agent setup?",
    initialValue: !hasMultipleAgents,
  });

  if (!shouldConfigure) {
    return cfg;
  }

  let nextConfig = cfg;
  let continueConfiguring = true;

  while (continueConfiguring) {
    const action = await prompter.select({
      message: "Select action",
      options: [
        { value: "add", label: "Add agent", hint: "Create a new specialized agent" },
        { value: "template", label: "Add from template", hint: "Use predefined agent templates" },
        { value: "defaults", label: "Configure sub-agent defaults", hint: "Global sub-agent settings" },
        { value: "done", label: "Done", hint: "Exit multi-agent configuration" },
      ],
    });

    switch (action) {
      case "add": {
        const agentConfig = await promptForAgentConfig({
          prompter,
          cfg: nextConfig,
          runtime,
        });

        if (agentConfig) {
          nextConfig = applyAgentConfig(nextConfig, {
            agentId: agentConfig.id,
            name: agentConfig.name,
            workspace: agentConfig.workspace,
            identity: agentConfig.identity,
            subagents: agentConfig.subagents,
            tools: agentConfig.tools,
          });
          await prompter.note(
            `Agent added: ${agentConfig.name ?? agentConfig.id}\nWorkspace: ${agentConfig.workspace}`,
            "Agent Created"
          );
        }
        break;
      }

      case "template": {
        const templateOptions = PREDEFINED_AGENT_TEMPLATES.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.id})`,
          hint: t.description,
        }));

        const selectedId = await prompter.select({
          message: "Select agent template to add",
          options: templateOptions,
        });

        const selectedTemplate = PREDEFINED_AGENT_TEMPLATES.find((t) => t.id === selectedId);
        if (selectedTemplate) {
          const workspace = resolveAgentWorkspaceDir(nextConfig, selectedTemplate.id);
          await ensureWorkspaceDir(resolveUserPath(workspace), runtime);
          await createAgentSoulFile(resolveUserPath(workspace), selectedTemplate.identity);

          nextConfig = applyAgentConfig(nextConfig, {
            agentId: selectedTemplate.id,
            name: selectedTemplate.name,
            workspace,
            identity: selectedTemplate.identity,
            tools: selectedTemplate.tools,
          });

          await prompter.note(
            `Agent added: ${selectedTemplate.name}\nWorkspace: ${workspace}`,
            "Agent Created"
          );
        }
        break;
      }

      case "defaults": {
        nextConfig = await configureSubagentDefaults({ cfg: nextConfig, prompter });
        break;
      }

      case "done": {
        continueConfiguring = false;
        break;
      }
    }
  }

  const mainAgent = agents.find((a) => a.default) ?? agents[0];
  if (mainAgent && !mainAgent.subagents?.allowAgents) {
    const allAgentIds = getAgentsList(nextConfig)
      .filter((a) => a.id !== mainAgent.id)
      .map((a) => a.id);

    if (allAgentIds.length > 0) {
      const allowAll = await prompter.confirm({
        message: "Allow main agent to create all types of sub-agents?",
        initialValue: true,
      });

      if (allowAll) {
        const mainIndex = findAgentEntryIndex(getAgentsList(nextConfig), mainAgent.id);
        if (mainIndex >= 0) {
          const list = [...(nextConfig.agents?.list ?? [])];
          list[mainIndex] = {
            ...list[mainIndex],
            subagents: {
              ...list[mainIndex].subagents,
              allowAgents: ["*"],
            },
          };
          nextConfig = {
            ...nextConfig,
            agents: {
              ...nextConfig.agents,
              list,
            },
          };
        }
      }
    }
  }

  return nextConfig;
}

export { PREDEFINED_AGENT_TEMPLATES };
