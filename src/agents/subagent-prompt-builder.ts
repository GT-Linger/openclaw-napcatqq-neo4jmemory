import { getSubagentById, loadSubagentsConfig } from "./subagent-manager.js";
import {
  readSubagentPersonalityFile,
  readSubagentSystemPromptFile,
  readSubagentToolsFile,
  readSubagentBehaviorFile,
} from "./subagent-workspace.js";
import { buildSubagentSystemPrompt as buildDefaultSystemPrompt } from "./subagent-announce.js";

export interface BuildSubagentPromptOptions {
  subagentId?: string;
  subagentLabel?: string;
  label?: string;
  requesterSessionKey?: string;
  requesterOrigin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  childSessionKey: string;
  task?: string;
  taskContext?: {
    background?: string;
    previousResults?: string;
    outputFormat?: string;
    otherTasks?: string[];
    taskId?: string;
  };
  childDepth?: number;
  maxSpawnDepth?: number;
  personality?: string;
  systemPrompt?: string;
  tools?: string;
  behavior?: string;
}

export function buildSubagentPrompt(options: BuildSubagentPromptOptions): string {
  const {
    subagentId,
    subagentLabel,
    label,
    requesterSessionKey,
    requesterOrigin,
    childSessionKey,
    task,
    taskContext,
    childDepth,
    maxSpawnDepth,
    personality,
    systemPrompt,
    tools,
    behavior,
  } = options;

  const defaultPrompt = buildDefaultSystemPrompt({
    requesterSessionKey,
    requesterOrigin,
    childSessionKey,
    label: subagentLabel ?? label,
    task,
    childDepth,
    maxSpawnDepth,
  });

  const customParts: string[] = [];

  if (personality) {
    customParts.push(
      "## Personality",
      "",
      personality,
      "",
    );
  }

  if (tools) {
    customParts.push(
      "## Tools Usage",
      "",
      tools,
      "",
    );
  }

  if (behavior) {
    customParts.push(
      "## Behavior Guidelines",
      "",
      behavior,
      "",
    );
  }

  if (systemPrompt) {
    customParts.push(
      "## Custom System Prompt",
      "",
      systemPrompt,
      "",
    );
  }

  const contextParts: string[] = [];
  if (taskContext) {
    if (taskContext.background) {
      contextParts.push("## Task Background (Original Request)");
      contextParts.push(taskContext.background);
      contextParts.push("");
    }

    if (taskContext.previousResults) {
      contextParts.push("## Previous Results (for reference)");
      contextParts.push(taskContext.previousResults);
      contextParts.push("");
    }

    if (taskContext.outputFormat) {
      contextParts.push("## Output Format");
      contextParts.push(taskContext.outputFormat);
      contextParts.push("");
    }

    if (taskContext.otherTasks && taskContext.otherTasks.length > 0) {
      contextParts.push("## Other Subagents in this Task");
      contextParts.push(taskContext.otherTasks.join("\n"));
      contextParts.push("");
    }

    if (taskContext.taskId) {
      contextParts.push(`---\nTask ID: ${taskContext.taskId}`);
    }
  }

  if (customParts.length === 0 && contextParts.length === 0) {
    return defaultPrompt;
  }

  const promptParts = [defaultPrompt];
  if (contextParts.length > 0) {
    promptParts.push("", "---", "", contextParts.join("\n"));
  }
  if (customParts.length > 0) {
    promptParts.push("", customParts.join("\n"));
  }

  return promptParts.join("\n");
}

export function loadSubagentPromptConfig(subagentId: string): {
  personality: string | null;
  systemPrompt: string | null;
  tools: string | null;
  behavior: string | null;
} {
  const personality = readSubagentPersonalityFile(subagentId);
  const systemPrompt = readSubagentSystemPromptFile(subagentId);
  const tools = readSubagentToolsFile(subagentId);
  const behavior = readSubagentBehaviorFile(subagentId);

  return {
    personality,
    systemPrompt,
    tools,
    behavior,
  };
}

export function loadSubagentFromConfig(subagentId: string): ReturnType<typeof getSubagentById> {
  return getSubagentById(subagentId);
}

export function buildSubagentPromptWithConfig(
  subagentId: string,
  options: Omit<BuildSubagentPromptOptions, "personality" | "systemPrompt" | "tools" | "behavior">,
): string {
  const config = getSubagentById(subagentId);

  let personality: string | null = null;
  let systemPrompt: string | null = null;
  let tools: string | null = null;
  let behavior: string | null = null;

  if (config) {
    const fromFiles = loadSubagentPromptConfig(subagentId);
    personality = fromFiles.personality ?? config.personality?.base ?? null;
    systemPrompt = fromFiles.systemPrompt ?? config.systemPrompt ?? null;
    tools = fromFiles.tools;
    behavior = fromFiles.behavior;
  } else {
    const fromFiles = loadSubagentPromptConfig(subagentId);
    personality = fromFiles.personality;
    systemPrompt = fromFiles.systemPrompt;
    tools = fromFiles.tools;
    behavior = fromFiles.behavior;
  }

  return buildSubagentPrompt({
    ...options,
    personality: personality ?? undefined,
    systemPrompt: systemPrompt ?? undefined,
    tools: tools ?? undefined,
    behavior: behavior ?? undefined,
  });
}
