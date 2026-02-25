import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readFileSync as fsReadFile } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { getLocale } from "../i18n/index.js";
import type { SubagentConfig } from "./subagent-config.js";
import {
  resolveSubagentDir,
  resolveSubagentFile,
} from "./agent-paths.js";

const SUBAGENT_TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/zh-CN/reference/templates/subagent",
);

function getSubagentTemplateDir(): string {
  const locale = getLocale();
  if (locale === "zh-CN" || locale === "zh-TW") {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../docs/${locale}/reference/templates/subagent`);
  }
  return SUBAGENT_TEMPLATE_DIR;
}

function loadSubagentTemplate(filename: string): string | null {
  const templateDir = getSubagentTemplateDir();
  const templatePath = path.join(templateDir, filename);
  try {
    if (existsSync(templatePath)) {
      return fsReadFile(templatePath, "utf-8");
    }
  } catch {
    return null;
  }
  return null;
}

function stripFrontMatter(content: string): string {
  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex !== -1) {
      return content.slice(endIndex + 3).trim();
    }
  }
  return content;
}

export interface SubagentWorkspaceFiles {
  personality?: string;
  systemPrompt?: string;
  tools?: string;
  behavior?: string;
}

export function ensureSubagentWorkspace(subagent: SubagentConfig, agentDir?: string): string {
  const dir = subagent.workspaceDir ?? resolveSubagentDir(subagent.id, agentDir);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function writeSubagentPersonalityFile(
  subagent: SubagentConfig,
  content: string,
  agentDir?: string,
): void {
  const workspaceDir = ensureSubagentWorkspace(subagent, agentDir);
  const filePath = resolveSubagentFile(subagent.id, "personality.md", agentDir);
  writeFileSync(filePath, content, "utf-8");
}

export function writeSubagentSystemPromptFile(
  subagent: SubagentConfig,
  content: string,
  agentDir?: string,
): void {
  const workspaceDir = ensureSubagentWorkspace(subagent, agentDir);
  const filePath = resolveSubagentFile(subagent.id, "system-prompt.md", agentDir);
  writeFileSync(filePath, content, "utf-8");
}

export function writeSubagentToolsFile(
  subagent: SubagentConfig,
  content: string,
  agentDir?: string,
): void {
  const workspaceDir = ensureSubagentWorkspace(subagent, agentDir);
  const filePath = resolveSubagentFile(subagent.id, "tools.md", agentDir);
  writeFileSync(filePath, content, "utf-8");
}

export function writeSubagentBehaviorFile(
  subagent: SubagentConfig,
  content: string,
  agentDir?: string,
): void {
  const workspaceDir = ensureSubagentWorkspace(subagent, agentDir);
  const filePath = resolveSubagentFile(subagent.id, "behavior.md", agentDir);
  writeFileSync(filePath, content, "utf-8");
}

export function readSubagentPersonalityFile(
  subagentId: string,
  agentDir?: string,
): string | null {
  const filePath = resolveSubagentFile(subagentId, "personality.md", agentDir);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export function readSubagentSystemPromptFile(
  subagentId: string,
  agentDir?: string,
): string | null {
  const filePath = resolveSubagentFile(subagentId, "system-prompt.md", agentDir);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export function readSubagentToolsFile(
  subagentId: string,
  agentDir?: string,
): string | null {
  const filePath = resolveSubagentFile(subagentId, "tools.md", agentDir);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export function readSubagentBehaviorFile(
  subagentId: string,
  agentDir?: string,
): string | null {
  const filePath = resolveSubagentFile(subagentId, "behavior.md", agentDir);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf-8");
}

export function readSubagentWorkspaceFiles(
  subagentId: string,
  agentDir?: string,
): SubagentWorkspaceFiles {
  return {
    personality: readSubagentPersonalityFile(subagentId, agentDir),
    systemPrompt: readSubagentSystemPromptFile(subagentId, agentDir),
    tools: readSubagentToolsFile(subagentId, agentDir),
    behavior: readSubagentBehaviorFile(subagentId, agentDir),
  };
}

export function hasSubagentWorkspace(subagentId: string, agentDir?: string): boolean {
  const dir = resolveSubagentDir(subagentId, agentDir);
  return existsSync(dir);
}

export function deleteSubagentWorkspace(subagentId: string, agentDir?: string): boolean {
  const dir = resolveSubagentDir(subagentId, agentDir);
  if (!existsSync(dir)) {
    return false;
  }
  try {
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function getSubagentWorkspacePath(subagentId: string, agentDir?: string): string {
  return resolveSubagentDir(subagentId, agentDir);
}

export function createSubagentWorkspaceFromConfig(
  subagent: SubagentConfig,
  agentDir?: string,
): void {
  ensureSubagentWorkspace(subagent, agentDir);

  if (subagent.personality?.personality) {
    writeSubagentPersonalityFile(subagent, subagent.personality.personality, agentDir);
  } else {
    const template = loadSubagentTemplate("personality.md");
    if (template) {
      writeSubagentPersonalityFile(subagent, stripFrontMatter(template), agentDir);
    }
  }

  if (subagent.systemPrompt) {
    writeSubagentSystemPromptFile(subagent, subagent.systemPrompt, agentDir);
  } else {
    const template = loadSubagentTemplate("system-prompt.md");
    if (template) {
      writeSubagentSystemPromptFile(subagent, stripFrontMatter(template), agentDir);
    }
  }

  const toolsTemplate = loadSubagentTemplate("tools.md");
  if (toolsTemplate) {
    writeSubagentToolsFile(subagent, stripFrontMatter(toolsTemplate), agentDir);
  }

  const behaviorTemplate = loadSubagentTemplate("behavior.md");
  if (behaviorTemplate) {
    writeSubagentBehaviorFile(subagent, stripFrontMatter(behaviorTemplate), agentDir);
  }
}
