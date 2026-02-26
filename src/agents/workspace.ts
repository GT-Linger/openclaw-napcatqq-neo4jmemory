import syncFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openBoundaryFile } from "../infra/boundary-file-read.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { isCronSessionKey, isSubagentSessionKey } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
import { resolveWorkspaceTemplateDir } from "./workspace-templates.js";
import { getLocale } from "../i18n/index.js";

type MemorySystemType = "file" | "graph" | "none";

function buildMemorySectionForTemplate(memoryType: MemorySystemType, locale: string): string {
  const isZhCN = locale === "zh-CN" || locale === "zh-TW";

  if (memoryType === "none") {
    return isZhCN
      ? "## 记忆\n\n记忆系统未启用。"
      : "## Memory\n\nMemory system is not enabled.";
  }

  if (memoryType === "graph") {
    if (isZhCN) {
      return `## 记忆召回（图谱）

在回答任何关于之前工作、决策、日期、人员偏好或待办事项的问题时：运行 memory_graph_search 查找知识图谱中的相关实体及其关系。

### 存储规则
- 使用 memory_entity_add 存储或更新实体（人物、项目、事件等）
- 使用 memory_relation_add 创建实体之间的关系
- 使用 memory_graph_search 的 includeRelations=true 参数遍历关联关系
- 程序会自动从对话中提取实体和关系（如果启用 autoCapture）
- 程序会在响应前自动召回相关记忆（如果启用 autoRecall）

### 实体智能更新
- 当添加的实体已存在时（相似度 >= 80%），会自动更新现有实体的内容，而不是创建重复实体
- 实体会记录创建时间 (createdAt) 和更新时间 (updatedAt)
- 可以通过设置 confidence 属性控制实体匹配的敏感度

### 实体类型
- Person: 人物
- Project: 项目
- Event: 事件
- Task: 任务
- Preference: 偏好
- Decision: 决策
- Note: 笔记
- Custom: 自定义类型

如果搜索后置信度较低，说明你已检查过。`;
    } else {
      return `## Memory Recall (Graph)

Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_graph_search to find relevant entities and their relationships in the knowledge graph.

### Storage Rules
- Use memory_entity_add to store or update entities (people, projects, events, etc.)
- Use memory_relation_add to create relationships between entities
- Use memory_graph_search with includeRelations=true to traverse connections
- The program will automatically extract entities and relationships from conversations (if autoCapture is enabled)
- The program will automatically recall relevant memories before responses (if autoRecall is enabled)

### Smart Entity Update
- When adding an entity that already exists (similarity >= 80%), it will automatically update the existing entity's content instead of creating duplicates
- Entities track creation time (createdAt) and update time (updatedAt)
- You can control entity matching sensitivity by setting the confidence attribute

### Entity Types
- Person: People
- Project: Projects
- Event: Events
- Task: Tasks
- Preference: Preferences
- Decision: Decisions
- Note: Notes
- Custom: Custom types

If low confidence after search, say you checked.`;
    }
  }

  if (isZhCN) {
    return `## 记忆召回

在回答任何关于之前工作、决策、日期、人员偏好或待办事项的问题时：运行 memory_search 搜索 MEMORY.md 和 memory/*.md；然后使用 memory_get 仅拉取需要的行。

### 存储规则
- 每日日志：使用 \`memory/YYYY-MM-DD.md\` 格式记录当天发生的事件
- 长期记忆：使用 \`MEMORY.md\` 存储持久的事实、偏好和重要决定
- 会话开始时，读取今天 + 昨天 + \`MEMORY.md\`（如果存在）
- 捕获内容：决定、偏好、约束、待办事项
- 除非明确要求，否则避免存储密钥等敏感信息

### 引用规则
引用：当它有助于用户验证记忆片段时，包含来源信息 <路径#行号>。`;
  } else {
    return `## Memory Recall

Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines.

### Storage Rules
- Daily logs: Use \`memory/YYYY-MM-DD.md\` format to record events of the day
- Long-term memory: Use \`MEMORY.md\` for persistent facts, preferences, and important decisions
- At session start, read today + yesterday + \`MEMORY.md\` (if exists)
- Capture: decisions, preferences, constraints, todos
- Unless explicitly asked, avoid storing sensitive information like keys

### Citation Rules
Citations: include Source: <path#line> when it helps the user verify memory snippets.`;
  }
}

function injectMemorySectionIntoAgents(agentsContent: string, memorySection: string): string {
  const memoryHeader = "## 记忆";
  const memoryHeaderEn = "## Memory";
  const placeholder = "程序会根据配置自动选择合适的记忆系统。具体使用方式请参考系统自动注入的提示。";
  const placeholderEn = "The program will automatically select the appropriate memory system based on your configuration. Refer to the system-injected prompts for specific usage instructions.";

  let result = agentsContent;

  if (result.includes(memoryHeader)) {
    const regex = new RegExp(
      `${memoryHeader}[\\s\\S]*?(?=\\n## |\\n# |$)`.replace(/\//g, "\\/"),
      "m"
    );
    result = result.replace(regex, memorySection);
  } else if (result.includes(memoryHeaderEn)) {
    const regex = new RegExp(
      `${memoryHeaderEn}[\\s\\S]*?(?=\\n## |\\n# |$)`.replace(/\//g, "\\/"),
      "m"
    );
    result = result.replace(regex, memorySection);
  } else if (result.includes(placeholder)) {
    result = result.replace(placeholder, memorySection);
  } else if (result.includes(placeholderEn)) {
    result = result.replace(placeholderEn, memorySection);
  }

  return result;
}

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const home = resolveRequiredHomeDir(env, homedir);
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(home, ".openclaw", `workspace-${profile}`);
  }
  return path.join(home, ".openclaw", "workspace");
}

export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
export const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
export const DEFAULT_SOUL_FILENAME = "SOUL.md";
export const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
export const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
export const DEFAULT_USER_FILENAME = "USER.md";
export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";
export const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
export const DEFAULT_MEMORY_FILENAME = "MEMORY.md";
export const DEFAULT_MEMORY_ALT_FILENAME = "memory.md";

export const MEMORY_DIR_NAME = "memory";
export const MEMORY_FILE_MEMORY_FILENAME = "file-memory.md";
export const MEMORY_GRAPH_MEMORY_FILENAME = "graph-memory.md";

export const PLATFORM_DIR_NAME = "platform";
export const PLATFORM_QQ_FILENAME = "qq.md";
export const PLATFORM_DISCORD_FILENAME = "discord.md";
export const PLATFORM_SLACK_FILENAME = "slack.md";
export const PLATFORM_TELEGRAM_FILENAME = "telegram.md";

export const FEATURES_DIR_NAME = "features";
export const FEATURES_SUBAGENT_FILENAME = "subagent.md";
export const FEATURES_TTS_FILENAME = "tts.md";

export const SUBAGENTS_INJECT_FILENAME = "subagents-inject.md";
const WORKSPACE_STATE_DIRNAME = ".openclaw";
const WORKSPACE_STATE_FILENAME = "workspace-state.json";
const WORKSPACE_STATE_VERSION = 1;

const workspaceTemplateCache = new Map<string, Promise<string>>();
let gitAvailabilityPromise: Promise<boolean> | null = null;
const MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES = 2 * 1024 * 1024;

// File content cache keyed by stable file identity to avoid stale reads.
const workspaceFileCache = new Map<string, { content: string; identity: string }>();

/**
 * Read workspace files via boundary-safe open and cache by inode/dev/size/mtime identity.
 */
type WorkspaceGuardedReadResult =
  | { ok: true; content: string }
  | { ok: false; reason: "path" | "validation" | "io"; error?: unknown };

function workspaceFileIdentity(stat: syncFs.Stats, canonicalPath: string): string {
  return `${canonicalPath}|${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
}

async function readWorkspaceFileWithGuards(params: {
  filePath: string;
  workspaceDir: string;
}): Promise<WorkspaceGuardedReadResult> {
  const opened = await openBoundaryFile({
    absolutePath: params.filePath,
    rootPath: params.workspaceDir,
    boundaryLabel: "workspace root",
    maxBytes: MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES,
  });
  if (!opened.ok) {
    workspaceFileCache.delete(params.filePath);
    return opened;
  }

  const identity = workspaceFileIdentity(opened.stat, opened.path);
  const cached = workspaceFileCache.get(params.filePath);
  if (cached && cached.identity === identity) {
    syncFs.closeSync(opened.fd);
    return { ok: true, content: cached.content };
  }

  try {
    const content = syncFs.readFileSync(opened.fd, "utf-8");
    workspaceFileCache.set(params.filePath, { content, identity });
    return { ok: true, content };
  } catch (error) {
    workspaceFileCache.delete(params.filePath);
    return { ok: false, reason: "io", error };
  } finally {
    syncFs.closeSync(opened.fd);
  }
}

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return content;
  }
  const start = endIndex + "\n---".length;
  let trimmed = content.slice(start);
  trimmed = trimmed.replace(/^\s+/, "");
  return trimmed;
}

async function loadTemplate(name: string): Promise<string> {
  const cached = workspaceTemplateCache.get(name);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const templateDir = await resolveWorkspaceTemplateDir();
    const templatePath = path.join(templateDir, name);
    try {
      const content = await fs.readFile(templatePath, "utf-8");
      return stripFrontMatter(content);
    } catch {
      throw new Error(
        `Missing workspace template: ${name} (${templatePath}). Ensure docs/reference/templates are packaged.`,
      );
    }
  })();

  workspaceTemplateCache.set(name, pending);
  try {
    return await pending;
  } catch (error) {
    workspaceTemplateCache.delete(name);
    throw error;
  }
}

export type WorkspaceBootstrapFileName =
  | typeof DEFAULT_AGENTS_FILENAME
  | typeof DEFAULT_SOUL_FILENAME
  | typeof DEFAULT_TOOLS_FILENAME
  | typeof DEFAULT_IDENTITY_FILENAME
  | typeof DEFAULT_USER_FILENAME
  | typeof DEFAULT_HEARTBEAT_FILENAME
  | typeof DEFAULT_BOOTSTRAP_FILENAME
  | typeof DEFAULT_MEMORY_FILENAME
  | typeof DEFAULT_MEMORY_ALT_FILENAME
  | typeof MEMORY_FILE_MEMORY_FILENAME
  | typeof MEMORY_GRAPH_MEMORY_FILENAME
  | typeof PLATFORM_QQ_FILENAME
  | typeof PLATFORM_DISCORD_FILENAME
  | typeof PLATFORM_SLACK_FILENAME
  | typeof PLATFORM_TELEGRAM_FILENAME
  | typeof FEATURES_SUBAGENT_FILENAME
  | typeof FEATURES_TTS_FILENAME
  | typeof SUBAGENTS_INJECT_FILENAME;

export type WorkspaceBootstrapFile = {
  name: WorkspaceBootstrapFileName;
  path: string;
  content?: string;
  missing: boolean;
};

export type ExtraBootstrapLoadDiagnosticCode =
  | "invalid-bootstrap-filename"
  | "missing"
  | "security"
  | "io";

export type ExtraBootstrapLoadDiagnostic = {
  path: string;
  reason: ExtraBootstrapLoadDiagnosticCode;
  detail: string;
};

type WorkspaceOnboardingState = {
  version: typeof WORKSPACE_STATE_VERSION;
  bootstrapSeededAt?: string;
  onboardingCompletedAt?: string;
};

/** Set of recognized bootstrap filenames for runtime validation */
const VALID_BOOTSTRAP_NAMES: ReadonlySet<string> = new Set([
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  MEMORY_FILE_MEMORY_FILENAME,
  MEMORY_GRAPH_MEMORY_FILENAME,
  PLATFORM_QQ_FILENAME,
  PLATFORM_DISCORD_FILENAME,
  PLATFORM_SLACK_FILENAME,
  PLATFORM_TELEGRAM_FILENAME,
  FEATURES_SUBAGENT_FILENAME,
  FEATURES_TTS_FILENAME,
  SUBAGENTS_INJECT_FILENAME,
]);

async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.writeFile(filePath, content, {
      encoding: "utf-8",
      flag: "wx",
    });
    return true;
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "EEXIST") {
      throw err;
    }
    return false;
  }
}

async function writeFileIfMissingOrOverwrite(filePath: string, content: string, overwrite: boolean): Promise<boolean> {
  if (overwrite) {
    await fs.writeFile(filePath, content, { encoding: "utf-8" });
    return true;
  }
  return writeFileIfMissing(filePath, content);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkspaceStatePath(dir: string): string {
  return path.join(dir, WORKSPACE_STATE_DIRNAME, WORKSPACE_STATE_FILENAME);
}

function parseWorkspaceOnboardingState(raw: string): WorkspaceOnboardingState | null {
  try {
    const parsed = JSON.parse(raw) as {
      bootstrapSeededAt?: unknown;
      onboardingCompletedAt?: unknown;
    };
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      version: WORKSPACE_STATE_VERSION,
      bootstrapSeededAt:
        typeof parsed.bootstrapSeededAt === "string" ? parsed.bootstrapSeededAt : undefined,
      onboardingCompletedAt:
        typeof parsed.onboardingCompletedAt === "string" ? parsed.onboardingCompletedAt : undefined,
    };
  } catch {
    return null;
  }
}

async function readWorkspaceOnboardingState(statePath: string): Promise<WorkspaceOnboardingState> {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    return (
      parseWorkspaceOnboardingState(raw) ?? {
        version: WORKSPACE_STATE_VERSION,
      }
    );
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "ENOENT") {
      throw err;
    }
    return {
      version: WORKSPACE_STATE_VERSION,
    };
  }
}

async function readWorkspaceOnboardingStateForDir(dir: string): Promise<WorkspaceOnboardingState> {
  const statePath = resolveWorkspaceStatePath(resolveUserPath(dir));
  return await readWorkspaceOnboardingState(statePath);
}

export async function isWorkspaceOnboardingCompleted(dir: string): Promise<boolean> {
  const state = await readWorkspaceOnboardingStateForDir(dir);
  return (
    typeof state.onboardingCompletedAt === "string" && state.onboardingCompletedAt.trim().length > 0
  );
}

async function writeWorkspaceOnboardingState(
  statePath: string,
  state: WorkspaceOnboardingState,
): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  try {
    await fs.writeFile(tmpPath, payload, { encoding: "utf-8" });
    await fs.rename(tmpPath, statePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

async function hasGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.stat(path.join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function isGitAvailable(): Promise<boolean> {
  if (gitAvailabilityPromise) {
    return gitAvailabilityPromise;
  }

  gitAvailabilityPromise = (async () => {
    try {
      const result = await runCommandWithTimeout(["git", "--version"], { timeoutMs: 2_000 });
      return result.code === 0;
    } catch {
      return false;
    }
  })();

  return gitAvailabilityPromise;
}

async function ensureGitRepo(dir: string, isBrandNewWorkspace: boolean) {
  if (!isBrandNewWorkspace) {
    return;
  }
  if (await hasGitRepo(dir)) {
    return;
  }
  if (!(await isGitAvailable())) {
    return;
  }
  try {
    await runCommandWithTimeout(["git", "init"], { cwd: dir, timeoutMs: 10_000 });
  } catch {
    // Ignore git init failures; workspace creation should still succeed.
  }
}

export type { MemorySystemType };

export function resolveMemorySystemType(config: { plugins?: { slots?: { memory?: string } } }): MemorySystemType {
  const memoryPlugin = config.plugins?.slots?.memory;
  if (!memoryPlugin || memoryPlugin === "none") {
    return "none";
  }
  if (memoryPlugin === "memory-neo4j") {
    return "graph";
  }
  return "file";
}

export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureBootstrapFiles?: boolean;
  memoryType?: MemorySystemType;
  forceOverwrite?: boolean;
}): Promise<{
  dir: string;
  agentsPath?: string;
  soulPath?: string;
  toolsPath?: string;
  identityPath?: string;
  userPath?: string;
  heartbeatPath?: string;
  bootstrapPath?: string;
}> {
  const rawDir = params?.dir?.trim() ? params.dir.trim() : DEFAULT_AGENT_WORKSPACE_DIR;
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (!params?.ensureBootstrapFiles) {
    return { dir };
  }

  const agentsPath = path.join(dir, DEFAULT_AGENTS_FILENAME);
  const soulPath = path.join(dir, DEFAULT_SOUL_FILENAME);
  const toolsPath = path.join(dir, DEFAULT_TOOLS_FILENAME);
  const identityPath = path.join(dir, DEFAULT_IDENTITY_FILENAME);
  const userPath = path.join(dir, DEFAULT_USER_FILENAME);
  const heartbeatPath = path.join(dir, DEFAULT_HEARTBEAT_FILENAME);
  const bootstrapPath = path.join(dir, DEFAULT_BOOTSTRAP_FILENAME);
  const statePath = resolveWorkspaceStatePath(dir);

  const isBrandNewWorkspace = await (async () => {
    const paths = [agentsPath, soulPath, toolsPath, identityPath, userPath, heartbeatPath];
    const existing = await Promise.all(
      paths.map(async (p) => {
        try {
          await fs.access(p);
          return true;
        } catch {
          return false;
        }
      }),
    );
    return existing.every((v) => !v);
  })();

  const agentsTemplateRaw = await loadTemplate(DEFAULT_AGENTS_FILENAME);
  const locale = getLocale();
  const memoryType = params?.memoryType ?? "file";
  const memorySection = buildMemorySectionForTemplate(memoryType, locale);
  const agentsTemplate = injectMemorySectionIntoAgents(agentsTemplateRaw, memorySection);

  const soulTemplate = await loadTemplate(DEFAULT_SOUL_FILENAME);
  const toolsTemplate = await loadTemplate(DEFAULT_TOOLS_FILENAME);
  const identityTemplate = await loadTemplate(DEFAULT_IDENTITY_FILENAME);
  const userTemplate = await loadTemplate(DEFAULT_USER_FILENAME);
  const heartbeatTemplate = await loadTemplate(DEFAULT_HEARTBEAT_FILENAME);
  const forceOverwrite = params?.forceOverwrite ?? false;
  await writeFileIfMissingOrOverwrite(agentsPath, agentsTemplate, forceOverwrite);
  await writeFileIfMissing(soulPath, soulTemplate);
  await writeFileIfMissing(toolsPath, toolsTemplate);
  await writeFileIfMissing(identityPath, identityTemplate);
  await writeFileIfMissing(userPath, userTemplate);
  await writeFileIfMissing(heartbeatPath, heartbeatTemplate);

  let state = await readWorkspaceOnboardingState(statePath);
  let stateDirty = false;
  const markState = (next: Partial<WorkspaceOnboardingState>) => {
    state = { ...state, ...next };
    stateDirty = true;
  };
  const nowIso = () => new Date().toISOString();

  let bootstrapExists = await fileExists(bootstrapPath);
  if (!state.bootstrapSeededAt && bootstrapExists) {
    markState({ bootstrapSeededAt: nowIso() });
  }

  if (!state.onboardingCompletedAt && state.bootstrapSeededAt && !bootstrapExists) {
    markState({ onboardingCompletedAt: nowIso() });
  }

  if (!state.bootstrapSeededAt && !state.onboardingCompletedAt && !bootstrapExists) {
    // Legacy migration path: if USER/IDENTITY diverged from templates, treat onboarding as complete
    // and avoid recreating BOOTSTRAP for already-onboarded workspaces.
    const [identityContent, userContent] = await Promise.all([
      fs.readFile(identityPath, "utf-8"),
      fs.readFile(userPath, "utf-8"),
    ]);
    const legacyOnboardingCompleted =
      identityContent !== identityTemplate || userContent !== userTemplate;
    if (legacyOnboardingCompleted) {
      markState({ onboardingCompletedAt: nowIso() });
    } else {
      const bootstrapTemplate = await loadTemplate(DEFAULT_BOOTSTRAP_FILENAME);
      const wroteBootstrap = await writeFileIfMissing(bootstrapPath, bootstrapTemplate);
      if (!wroteBootstrap) {
        bootstrapExists = await fileExists(bootstrapPath);
      } else {
        bootstrapExists = true;
      }
      if (bootstrapExists && !state.bootstrapSeededAt) {
        markState({ bootstrapSeededAt: nowIso() });
      }
    }
  }

  if (stateDirty) {
    await writeWorkspaceOnboardingState(statePath, state);
  }
  await ensureGitRepo(dir, isBrandNewWorkspace);

  return {
    dir,
    agentsPath,
    soulPath,
    toolsPath,
    identityPath,
    userPath,
    heartbeatPath,
    bootstrapPath,
  };
}

async function resolveMemoryBootstrapEntries(
  resolvedDir: string,
): Promise<Array<{ name: WorkspaceBootstrapFileName; filePath: string }>> {
  const candidates: WorkspaceBootstrapFileName[] = [
    DEFAULT_MEMORY_FILENAME,
    DEFAULT_MEMORY_ALT_FILENAME,
  ];
  const entries: Array<{ name: WorkspaceBootstrapFileName; filePath: string }> = [];
  for (const name of candidates) {
    const filePath = path.join(resolvedDir, name);
    try {
      await fs.access(filePath);
      entries.push({ name, filePath });
    } catch {
      // optional
    }
  }
  if (entries.length <= 1) {
    return entries;
  }

  const seen = new Set<string>();
  const deduped: Array<{ name: WorkspaceBootstrapFileName; filePath: string }> = [];
  for (const entry of entries) {
    let key = entry.filePath;
    try {
      key = await fs.realpath(entry.filePath);
    } catch {}
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function resolveModuleBootstrapEntries(
  resolvedDir: string,
  subDir: string,
  filenames: string[],
): Array<{ name: WorkspaceBootstrapFileName; filePath: string }> {
  const entries: Array<{ name: WorkspaceBootstrapFileName; filePath: string }> = [];
  const moduleDir = path.join(resolvedDir, subDir);

  for (const filename of filenames) {
    const filePath = path.join(moduleDir, filename);
    entries.push({
      name: filename as WorkspaceBootstrapFileName,
      filePath,
    });
  }

  return entries;
}

export async function loadWorkspaceBootstrapFiles(dir: string): Promise<WorkspaceBootstrapFile[]> {
  const resolvedDir = resolveUserPath(dir);

  const priorityEntries: Array<{
    name: WorkspaceBootstrapFileName;
    filePath: string;
  }> = [];

  const secondaryEntries: Array<{
    name: WorkspaceBootstrapFileName;
    filePath: string;
  }> = [];

  priorityEntries.push(
    {
      name: DEFAULT_AGENTS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_AGENTS_FILENAME),
    },
    {
      name: DEFAULT_SOUL_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_SOUL_FILENAME),
    },
  );

  priorityEntries.push(...(await resolveMemoryBootstrapEntries(resolvedDir)));
  priorityEntries.push(...resolveModuleBootstrapEntries(resolvedDir, MEMORY_DIR_NAME, [
    MEMORY_FILE_MEMORY_FILENAME,
    MEMORY_GRAPH_MEMORY_FILENAME,
  ]));

  secondaryEntries.push(
    {
      name: DEFAULT_TOOLS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_TOOLS_FILENAME),
    },
    {
      name: DEFAULT_IDENTITY_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_IDENTITY_FILENAME),
    },
    {
      name: DEFAULT_USER_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_USER_FILENAME),
    },
    {
      name: DEFAULT_HEARTBEAT_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_HEARTBEAT_FILENAME),
    },
    {
      name: DEFAULT_BOOTSTRAP_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_BOOTSTRAP_FILENAME),
    },
  );

  secondaryEntries.push(...resolveModuleBootstrapEntries(resolvedDir, PLATFORM_DIR_NAME, [
    PLATFORM_QQ_FILENAME,
    PLATFORM_DISCORD_FILENAME,
    PLATFORM_SLACK_FILENAME,
    PLATFORM_TELEGRAM_FILENAME,
  ]));
  secondaryEntries.push(...resolveModuleBootstrapEntries(resolvedDir, FEATURES_DIR_NAME, [
    FEATURES_SUBAGENT_FILENAME,
    FEATURES_TTS_FILENAME,
  ]));

  secondaryEntries.push({
    name: SUBAGENTS_INJECT_FILENAME,
    filePath: path.join(resolvedDir, SUBAGENTS_INJECT_FILENAME),
  });

  const result: WorkspaceBootstrapFile[] = [];

  for (const entry of priorityEntries) {
    const loaded = await readWorkspaceFileWithGuards({
      filePath: entry.filePath,
      workspaceDir: resolvedDir,
    });
    if (loaded.ok) {
      result.push({
        name: entry.name,
        path: entry.filePath,
        content: loaded.content,
        missing: false,
      });
    } else {
      result.push({ name: entry.name, path: entry.filePath, missing: true });
    }
  }

  for (const entry of secondaryEntries) {
    const loaded = await readWorkspaceFileWithGuards({
      filePath: entry.filePath,
      workspaceDir: resolvedDir,
    });
    if (loaded.ok) {
      result.push({
        name: entry.name,
        path: entry.filePath,
        content: loaded.content,
        missing: false,
      });
    } else {
      result.push({ name: entry.name, path: entry.filePath, missing: true });
    }
  }

  return result;
}

const MINIMAL_BOOTSTRAP_ALLOWLIST = new Set([
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
]);

export interface BootstrapFilterOptions {
  memoryType?: "file" | "graph" | "none";
  channel?: "qq" | "discord" | "slack" | "telegram" | "telegram-group";
  hasSubagents?: boolean;
  hasTts?: boolean;
  sessionKey?: string;
}

export function filterBootstrapFilesForSession(
  files: WorkspaceBootstrapFile[],
  sessionKey?: string,
): WorkspaceBootstrapFile[];
export function filterBootstrapFilesForSession(
  files: WorkspaceBootstrapFile[],
  options?: BootstrapFilterOptions,
): WorkspaceBootstrapFile[];
export function filterBootstrapFilesForSession(
  files: WorkspaceBootstrapFile[],
  options?: string | BootstrapFilterOptions,
): WorkspaceBootstrapFile[] {
  const sessionKey = typeof options === "string" ? options : options?.sessionKey;
  const filterOpts = typeof options === "object" ? options : undefined;

  if (!sessionKey && !filterOpts) {
    return files;
  }

  if (sessionKey && (!isSubagentSessionKey(sessionKey) && !isCronSessionKey(sessionKey)) && !filterOpts) {
    return files;
  }

  let filtered = files;

  if (sessionKey && (isSubagentSessionKey(sessionKey) || isCronSessionKey(sessionKey))) {
    filtered = filtered.filter((file) => MINIMAL_BOOTSTRAP_ALLOWLIST.has(file.name));
  }

  if (filterOpts) {
    filtered = applyModuleFilters(filtered, filterOpts);
  }

  return filtered;
}

function applyModuleFilters(
  files: WorkspaceBootstrapFile[],
  opts: BootstrapFilterOptions,
): WorkspaceBootstrapFile[] {
  const result: WorkspaceBootstrapFile[] = [];

  for (const file of files) {
    let include = true;

    if (file.name === MEMORY_FILE_MEMORY_FILENAME || file.name === MEMORY_GRAPH_MEMORY_FILENAME) {
      if (opts.memoryType === "file") {
        include = file.name === MEMORY_FILE_MEMORY_FILENAME;
      } else if (opts.memoryType === "graph") {
        include = file.name === MEMORY_GRAPH_MEMORY_FILENAME;
      } else {
        include = false;
      }
    }

    if ([PLATFORM_QQ_FILENAME, PLATFORM_DISCORD_FILENAME, PLATFORM_SLACK_FILENAME, PLATFORM_TELEGRAM_FILENAME].includes(file.name)) {
      if (!opts.channel) {
        include = false;
      } else {
        const channelToFile: Record<string, string> = {
          qq: PLATFORM_QQ_FILENAME,
          discord: PLATFORM_DISCORD_FILENAME,
          slack: PLATFORM_SLACK_FILENAME,
          telegram: PLATFORM_TELEGRAM_FILENAME,
          "telegram-group": PLATFORM_TELEGRAM_FILENAME,
        };
        include = channelToFile[opts.channel] === file.name;
      }
    }

    if (file.name === FEATURES_SUBAGENT_FILENAME) {
      include = opts.hasSubagents === true;
    }

    if (file.name === FEATURES_TTS_FILENAME) {
      include = opts.hasTts === true;
    }

    if (include) {
      result.push(file);
    }
  }

  return result;
}

export async function loadExtraBootstrapFiles(
  dir: string,
  extraPatterns: string[],
): Promise<WorkspaceBootstrapFile[]> {
  const loaded = await loadExtraBootstrapFilesWithDiagnostics(dir, extraPatterns);
  return loaded.files;
}

export async function loadExtraBootstrapFilesWithDiagnostics(
  dir: string,
  extraPatterns: string[],
): Promise<{
  files: WorkspaceBootstrapFile[];
  diagnostics: ExtraBootstrapLoadDiagnostic[];
}> {
  if (!extraPatterns.length) {
    return { files: [], diagnostics: [] };
  }
  const resolvedDir = resolveUserPath(dir);

  // Resolve glob patterns into concrete file paths
  const resolvedPaths = new Set<string>();
  for (const pattern of extraPatterns) {
    if (pattern.includes("*") || pattern.includes("?") || pattern.includes("{")) {
      try {
        const matches = fs.glob(pattern, { cwd: resolvedDir });
        for await (const m of matches) {
          resolvedPaths.add(m);
        }
      } catch {
        // glob not available or pattern error — fall back to literal
        resolvedPaths.add(pattern);
      }
    } else {
      resolvedPaths.add(pattern);
    }
  }

  const files: WorkspaceBootstrapFile[] = [];
  const diagnostics: ExtraBootstrapLoadDiagnostic[] = [];
  for (const relPath of resolvedPaths) {
    const filePath = path.resolve(resolvedDir, relPath);
    // Only load files whose basename is a recognized bootstrap filename
    const baseName = path.basename(relPath);
    if (!VALID_BOOTSTRAP_NAMES.has(baseName)) {
      diagnostics.push({
        path: filePath,
        reason: "invalid-bootstrap-filename",
        detail: `unsupported bootstrap basename: ${baseName}`,
      });
      continue;
    }
    const loaded = await readWorkspaceFileWithGuards({
      filePath,
      workspaceDir: resolvedDir,
    });
    if (loaded.ok) {
      files.push({
        name: baseName as WorkspaceBootstrapFileName,
        path: filePath,
        content: loaded.content,
        missing: false,
      });
      continue;
    }

    const reason: ExtraBootstrapLoadDiagnosticCode =
      loaded.reason === "path" ? "missing" : loaded.reason === "validation" ? "security" : "io";
    diagnostics.push({
      path: filePath,
      reason,
      detail:
        loaded.error instanceof Error
          ? loaded.error.message
          : typeof loaded.error === "string"
            ? loaded.error
            : reason,
    });
  }
  return { files, diagnostics };
}
