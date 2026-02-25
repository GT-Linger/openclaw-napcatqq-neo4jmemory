import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import type { SubagentConfig } from "./subagent-config.js";
import { SUBAGENTS_CONFIG_FILENAME } from "./subagent-config.js";
import { resolveWorkspaceRoot } from "./workspace-dir.js";
import { t, getLocale } from "../i18n/index.js";

export interface SubagentExportData {
  version: string;
  exportedAt: string;
  subagent: SubagentConfig;
}

const EXPORT_VERSION = "1.0";

const SUBAGENTS_INJECT_FILENAME = "subagents-inject.md";

function getSubagentsInjectPath(): string {
  const workspaceDir = resolveWorkspaceRoot();
  return join(workspaceDir, SUBAGENTS_INJECT_FILENAME);
}

function generateSubagentsInjectContent(subagents: SubagentConfig[]): string {
  if (subagents.length === 0) {
    return "";
  }

  const lines: string[] = [
    `## ${t("subagent.injectTitle")}`,
    "",
    `${t("subagent.injectIntro")}`,
    "",
  ];

  for (const s of subagents) {
    const category = s.metadata?.category || "general";
    const tags = s.metadata?.tags?.join(", ") || "";
    const tagsStr = tags ? ` [${tags}]` : "";

    lines.push(`### ${s.name} (${category})${tagsStr}`);
    lines.push(`- **ID**: \`${s.id}\``);
    lines.push(`- ${t("subagent.injectDescription")}: ${s.description}`);
    lines.push(`- ${t("subagent.injectModel")}: ${s.model.endpoint.model} (${s.model.endpoint.provider})`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(t("subagent.injectUsageNote"));

  return lines.join("\n");
}

function updateSubagentsInjectFile(): void {
  try {
    const subagents = loadSubagentsConfig();
    const content = generateSubagentsInjectContent(subagents);
    const injectPath = getSubagentsInjectPath();

    if (content) {
      const dir = dirname(injectPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(injectPath, content, "utf-8");
    } else {
      if (existsSync(injectPath)) {
        writeFileSync(injectPath, "", "utf-8");
      }
    }
  } catch (error) {
    console.error("[SubagentManager] Failed to update inject file:", error);
  }
}

export function loadSubagentsConfig(agentDir?: string): SubagentConfig[] {
  try {
    const dir = resolveOpenClawAgentDir(agentDir);
    const configPath = join(dir, SUBAGENTS_CONFIG_FILENAME);
    
    if (!existsSync(configPath)) {
      return [];
    }
    
    const content = readFileSync(configPath, "utf-8");
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data as SubagentConfig[];
  } catch (error) {
    console.error("[Subagent] Failed to load subagents config:", error);
    return [];
  }
}

export function saveSubagentsConfig(subagents: SubagentConfig[], agentDir?: string): void {
  try {
    const dir = resolveOpenClawAgentDir(agentDir);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const configPath = join(dir, SUBAGENTS_CONFIG_FILENAME);
    writeFileSync(configPath, JSON.stringify(subagents, null, 2), "utf-8");
  } catch (error) {
    console.error("[Subagent] Failed to save subagents config:", error);
    throw error;
  }
}

export function getSubagentById(id: string, agentDir?: string): SubagentConfig | null {
  const subagents = loadSubagentsConfig(agentDir);
  return subagents.find((s) => s.id === id) ?? null;
}

export function addSubagent(config: SubagentConfig, agentDir?: string): void {
  const subagents = loadSubagentsConfig(agentDir);
  
  const existingIndex = subagents.findIndex((s) => s.id === config.id);
  if (existingIndex >= 0) {
    subagents[existingIndex] = config;
  } else {
    subagents.push(config);
  }
  
  saveSubagentsConfig(subagents, agentDir);
  updateSubagentsInjectFile();
}

export function updateSubagent(id: string, updates: Partial<SubagentConfig>, agentDir?: string): boolean {
  const subagents = loadSubagentsConfig(agentDir);
  const index = subagents.findIndex((s) => s.id === id);
  
  if (index < 0) {
    return false;
  }
  
  subagents[index] = { ...subagents[index], ...updates };
  saveSubagentsConfig(subagents, agentDir);
  return true;
}

export function removeSubagent(id: string, agentDir?: string): boolean {
  const subagents = loadSubagentsConfig(agentDir);
  const filtered = subagents.filter((s) => s.id !== id);
  
  if (filtered.length === subagents.length) {
    return false;
  }
  
  saveSubagentsConfig(filtered, agentDir);
  updateSubagentsInjectFile();
  return true;
}

export function listSubagents(agentDir?: string): SubagentConfig[] {
  return loadSubagentsConfig(agentDir);
}

export function exportSubagent(id: string, agentDir?: string): SubagentExportData | null {
  const subagent = getSubagentById(id, agentDir);
  
  if (!subagent) {
    return null;
  }
  
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    subagent,
  };
}

export function exportSubagentToFile(id: string, filePath: string, agentDir?: string): boolean {
  const exportData = exportSubagent(id, agentDir);
  
  if (!exportData) {
    return false;
  }
  
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(filePath, JSON.stringify(exportData, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[Subagent] Failed to export subagent to file:", error);
    return false;
  }
}

export function importSubagentFromFile(filePath: string, agentDir?: string): SubagentConfig | null {
  try {
    if (!existsSync(filePath)) {
      console.error("[Subagent] Import file not found:", filePath);
      return null;
    }
    
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    
    if (data.version && data.subagent) {
      return data.subagent as SubagentConfig;
    }
    
    if (data.id && data.name && data.model) {
      return data as SubagentConfig;
    }
    
    console.error("[Subagent] Invalid import file format");
    return null;
  } catch (error) {
    console.error("[Subagent] Failed to import subagent from file:", error);
    return null;
  }
}

export function importSubagent(config: SubagentConfig, agentDir?: string, overwrite: boolean = false): boolean {
  const existing = getSubagentById(config.id, agentDir);
  
  if (existing && !overwrite) {
    console.error(`[Subagent] Subagent with id "${config.id}" already exists. Use overwrite=true to replace.`);
    return false;
  }
  
  addSubagent(config, agentDir);
  return true;
}

export function importSubagentFromFileAndSave(
  filePath: string,
  agentDir?: string,
  overwrite: boolean = false
): boolean {
  const config = importSubagentFromFile(filePath, agentDir);
  
  if (!config) {
    return false;
  }
  
  return importSubagent(config, agentDir, overwrite);
}

export function duplicateSubagent(
  sourceId: string,
  newId: string,
  newName: string,
  agentDir?: string
): SubagentConfig | null {
  const source = getSubagentById(sourceId, agentDir);
  
  if (!source) {
    return null;
  }
  
  const duplicate: SubagentConfig = {
    ...source,
    id: newId,
    name: newName,
    metadata: source.metadata ? { ...source.metadata } : undefined,
    personality: source.personality ? { ...source.personality } : undefined,
    model: { ...source.model, endpoint: { ...source.model.endpoint } },
    behavior: source.behavior ? { ...source.behavior } : undefined,
  };
  
  addSubagent(duplicate, agentDir);
  return duplicate;
}
