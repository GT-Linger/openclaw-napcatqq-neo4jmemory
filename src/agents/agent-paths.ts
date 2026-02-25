import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { DEFAULT_AGENT_ID } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";

export const SUBAGENTS_DIR_NAME = "subagents";
export const SUBAGENT_DIR_NAME = "subagent";
export const SUBAGENT_PERSONALITY_FILE = "personality.md";
export const SUBAGENT_SYSTEM_PROMPT_FILE = "system-prompt.md";
export const SUBAGENT_TOOLS_FILE = "tools.md";
export const SUBAGENT_BEHAVIOR_FILE = "behavior.md";
export const SUBAGENT_CONFIG_FILE = "config.json";

export type SubagentTemplateFile =
  | "personality.md"
  | "system-prompt.md"
  | "tools.md"
  | "behavior.md"
  | "config.json";

export function resolveOpenClawAgentDir(): string {
  const override =
    process.env.OPENCLAW_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  const defaultAgentDir = path.join(resolveStateDir(), "agents", DEFAULT_AGENT_ID, "agent");
  return resolveUserPath(defaultAgentDir);
}

export function resolveSubagentsDir(agentDir?: string): string {
  const baseDir = agentDir ?? resolveOpenClawAgentDir();
  return path.join(baseDir, SUBAGENTS_DIR_NAME);
}

export function resolveSubagentDir(subagentId: string, agentDir?: string): string {
  const subagentsDir = resolveSubagentsDir(agentDir);
  return path.join(subagentsDir, subagentId);
}

export function resolveSubagentFile(
  subagentId: string,
  filename: SubagentTemplateFile,
  agentDir?: string,
): string {
  const subagentDir = resolveSubagentDir(subagentId, agentDir);
  return path.join(subagentDir, filename);
}

export function ensureOpenClawAgentEnv(): string {
  const dir = resolveOpenClawAgentDir();
  if (!process.env.OPENCLAW_AGENT_DIR) {
    process.env.OPENCLAW_AGENT_DIR = dir;
  }
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = dir;
  }
  return dir;
}
