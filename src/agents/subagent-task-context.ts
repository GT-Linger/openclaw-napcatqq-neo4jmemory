import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface SubagentTask {
  subagentId: string;
  instruction: string;
  dependsOn?: string;
  expectedOutput?: string;
}

export interface TaskContext {
  taskId: string;
  originalRequest: string;
  subagentTasks: SubagentTask[];
  sharedResults: Map<string, any>;
  createdAt: number;
  status: "pending" | "running" | "completed" | "failed";
  timeoutMs?: number;
  completedAt?: number;
  error?: string;
}

export interface SubagentMessage {
  background: string;
  myTask: string;
  previousResults?: string;
  outputFormat?: string;
  otherTasks?: string[];
  taskId: string;
}

export interface TaskPersistenceData {
  taskId: string;
  originalRequest: string;
  subagentTasks: SubagentTask[];
  createdAt: number;
  status: string;
  timeoutMs?: number;
  completedAt?: number;
  error?: string;
  sharedResults?: Record<string, any>;
}

const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const TASK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const TASK_EXPIRY_MS = 24 * 60 * 60 * 1000;

function resolveTaskPersistenceDir(): string {
  return path.join(resolveStateDir(), "agents", "task-contexts");
}

function resolveTaskFilePath(taskId: string): string {
  return path.join(resolveTaskPersistenceDir(), `${taskId}.json`);
}

class TaskContextManager {
  private contexts: Map<string, TaskContext> = new Map();
  private taskQueue: Map<string, TaskPersistenceData> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTasks();
    }, TASK_CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private cleanupExpiredTasks(): void {
    const now = Date.now();
    const expiredTaskIds: string[] = [];

    for (const [taskId, context] of this.contexts.entries()) {
      const isExpired = now - context.createdAt > TASK_EXPIRY_MS;
      const isTimedOut = context.timeoutMs && context.status === "running" && now - context.createdAt > context.timeoutMs;

      if (isExpired || isTimedOut) {
        if (isTimedOut) {
          context.status = "failed";
          context.error = "Task timed out";
          context.completedAt = now;
          this.persistContextToDisk(context);
        }
        expiredTaskIds.push(taskId);
      }
    }

    for (const taskId of expiredTaskIds) {
      this.contexts.delete(taskId);
      this.taskQueue.delete(taskId);
    }

    if (expiredTaskIds.length > 0) {
      console.log(`[TaskContext] Cleaned up ${expiredTaskIds.length} expired/timed-out tasks`);
    }
  }

  private async ensurePersistenceDir(): Promise<void> {
    const dir = resolveTaskPersistenceDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private async persistContextToDisk(context: TaskContext): Promise<void> {
    try {
      await this.ensurePersistenceDir();
      const data: TaskPersistenceData = {
        taskId: context.taskId,
        originalRequest: context.originalRequest,
        subagentTasks: context.subagentTasks,
        createdAt: context.createdAt,
        status: context.status,
        timeoutMs: context.timeoutMs,
        completedAt: context.completedAt,
        error: context.error,
        sharedResults: Object.fromEntries(context.sharedResults),
      };
      const filePath = resolveTaskFilePath(context.taskId);
      await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error(`[TaskContext] Failed to persist task ${context.taskId}:`, err);
    }
  }

  private async loadContextFromDisk(taskId: string): Promise<TaskContext | null> {
    try {
      const filePath = resolveTaskFilePath(taskId);
      if (!existsSync(filePath)) {
        return null;
      }
      const content = await readFile(filePath, "utf-8");
      const data: TaskPersistenceData = JSON.parse(content);
      const context: TaskContext = {
        taskId: data.taskId,
        originalRequest: data.originalRequest,
        subagentTasks: data.subagentTasks,
        sharedResults: new Map(Object.entries(data.sharedResults ?? {})),
        createdAt: data.createdAt,
        status: data.status as TaskContext["status"],
        timeoutMs: data.timeoutMs,
        completedAt: data.completedAt,
        error: data.error,
      };
      return context;
    } catch (err) {
      console.error(`[TaskContext] Failed to load task ${taskId}:`, err);
      return null;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      const dir = resolveTaskPersistenceDir();
      if (!existsSync(dir)) {
        return;
      }

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of jsonFiles) {
        const taskId = file.replace(".json", "");
        const context = await this.loadContextFromDisk(taskId);
        if (context && (context.status === "pending" || context.status === "running")) {
          this.contexts.set(taskId, context);
          console.log(`[TaskContext] Restored task ${taskId} from disk`);
        }
      }
    } catch (err) {
      console.error("[TaskContext] Failed to initialize from disk:", err);
    }
  }

  createContext(originalRequest: string, tasks: SubagentTask[], timeoutMs?: number): TaskContext {
    const taskId = crypto.randomUUID();
    const context: TaskContext = {
      taskId,
      originalRequest,
      subagentTasks: tasks,
      sharedResults: new Map(),
      createdAt: Date.now(),
      status: "pending",
      timeoutMs: timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
    };
    this.contexts.set(taskId, context);
    this.persistContextToDisk(context);
    return context;
  }

  getContext(taskId: string): TaskContext | undefined {
    return this.contexts.get(taskId);
  }

  async getContextOrLoad(taskId: string): Promise<TaskContext | undefined> {
    const cached = this.contexts.get(taskId);
    if (cached) {
      return cached;
    }
    const loaded = await this.loadContextFromDisk(taskId);
    if (loaded) {
      this.contexts.set(taskId, loaded);
      return loaded;
    }
    return undefined;
  }

  updateContextStatus(taskId: string, status: TaskContext["status"], error?: string): void {
    const context = this.contexts.get(taskId);
    if (context) {
      context.status = status;
      if (error) {
        context.error = error;
      }
      if (status === "completed" || status === "failed") {
        context.completedAt = Date.now();
      }
      this.persistContextToDisk(context);
    }
    const queueData = this.taskQueue.get(taskId);
    if (queueData) {
      queueData.status = status;
    }
  }

  setResult(taskId: string, subagentId: string, result: any): void {
    const context = this.contexts.get(taskId);
    if (context) {
      context.sharedResults.set(subagentId, result);
      this.persistContextToDisk(context);
    }
  }

  getResult(taskId: string, subagentId: string): any | undefined {
    const context = this.contexts.get(taskId);
    if (context) {
      return context.sharedResults.get(subagentId);
    }
    return undefined;
  }

  getAllResults(taskId: string): Map<string, any> {
    const context = this.contexts.get(taskId);
    return context?.sharedResults ?? new Map();
  }

  buildSubagentMessage(
    context: TaskContext,
    subagentTask: SubagentTask,
    showOtherTasks: boolean = true,
  ): SubagentMessage {
    const otherTasks = showOtherTasks
      ? context.subagentTasks
          .filter((t) => t.subagentId !== subagentTask.subagentId)
          .map((t) => `- ${t.subagentId}: ${t.instruction}`)
      : [];

    const previousResult = subagentTask.dependsOn
      ? context.sharedResults.get(subagentTask.dependsOn)
      : undefined;

    return {
      background: context.originalRequest,
      myTask: subagentTask.instruction,
      previousResults: previousResult ? JSON.stringify(previousResult, null, 2) : undefined,
      outputFormat: subagentTask.expectedOutput,
      otherTasks: otherTasks.length > 0 ? otherTasks : undefined,
      taskId: context.taskId,
    };
  }

  formatMessageForSubagent(message: SubagentMessage): string {
    const parts: string[] = [];

    parts.push("# Task Context");
    parts.push("");
    parts.push(`## Background (Original Request)`);
    parts.push(message.background);
    parts.push("");

    parts.push(`## Your Task`);
    parts.push(message.myTask);
    parts.push("");

    if (message.previousResults) {
      parts.push("## Previous Results (for reference)");
      parts.push(message.previousResults);
      parts.push("");
    }

    if (message.outputFormat) {
      parts.push("## Output Format");
      parts.push(message.outputFormat);
      parts.push("");
    }

    if (message.otherTasks && message.otherTasks.length > 0) {
      parts.push("## Other Subagents in this Task");
      parts.push(message.otherTasks.join("\n"));
      parts.push("");
    }

    parts.push(`---\nTask ID: ${message.taskId}`);

    return parts.join("\n");
  }

  persistToQueue(context: TaskContext): void {
    const data: TaskPersistenceData = {
      taskId: context.taskId,
      originalRequest: context.originalRequest,
      subagentTasks: context.subagentTasks,
      createdAt: context.createdAt,
      status: context.status,
      timeoutMs: context.timeoutMs,
      completedAt: context.completedAt,
      error: context.error,
    };
    this.taskQueue.set(context.taskId, data);
  }

  loadFromQueue(taskId: string): TaskPersistenceData | undefined {
    return this.taskQueue.get(taskId);
  }

  restoreContext(data: TaskPersistenceData): TaskContext {
    const context: TaskContext = {
      taskId: data.taskId,
      originalRequest: data.originalRequest,
      subagentTasks: data.subagentTasks,
      sharedResults: new Map(Object.entries(data.sharedResults ?? {})),
      createdAt: data.createdAt,
      status: data.status as TaskContext["status"],
      timeoutMs: data.timeoutMs,
      completedAt: data.completedAt,
      error: data.error,
    };
    this.contexts.set(data.taskId, context);
    return context;
  }

  async cleanup(taskId: string): Promise<void> {
    const context = this.contexts.get(taskId);
    if (context) {
      context.status = "completed";
      context.completedAt = Date.now();
      await this.persistContextToDisk(context);
    }
    this.contexts.delete(taskId);
    this.taskQueue.delete(taskId);
  }

  async deleteFromDisk(taskId: string): Promise<void> {
    try {
      const filePath = resolveTaskFilePath(taskId);
      if (existsSync(filePath)) {
        const { unlink } = await import("node:fs/promises");
        await unlink(filePath);
      }
    } catch (err) {
      console.error(`[TaskContext] Failed to delete task file ${taskId}:`, err);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const taskContextManager = new TaskContextManager();
