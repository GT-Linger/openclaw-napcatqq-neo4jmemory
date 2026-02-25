import os from "node:os";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SubagentConfig } from "./subagent-config.js";
import { listSubagentRunsForRequester } from "./subagent-registry.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { VLLM_MODELS_CONFIG_FILENAME } from "./subagent-vllm-config.js";
import type { VllmModelListEntry } from "./subagent-vllm-config.js";

export interface WaitingSubagent {
  runId: string;
  subagentId: string;
  task: string;
  label?: string;
  modelKey: string;
  gpuMemoryUtilization: number;
  requestedAt: number;
  resolve: (runId: string) => void;
  reject: (error: Error) => void;
}

const waitingQueue: Map<string, WaitingSubagent[]> = new Map();

const activeModelSlots: Map<string, Set<string>> = new Map();

const activeMemoryUsage: Map<string, number> = new Map();

export enum MemoryArchitecture {
  LOCAL_GPU = "local_gpu",
  UNIFIED_MEMORY = "unified_memory",
  REMOTE_GPU = "remote_gpu",
}

export interface MemoryConfig {
  architecture: MemoryArchitecture;
  maxMemoryUtilization: number;
  systemReserve: number;
}

const DEFAULT_MEMORY_CONFIGS: Record<MemoryArchitecture, MemoryConfig> = {
  [MemoryArchitecture.LOCAL_GPU]: {
    architecture: MemoryArchitecture.LOCAL_GPU,
    maxMemoryUtilization: 0.85,
    systemReserve: 0.05,
  },
  [MemoryArchitecture.UNIFIED_MEMORY]: {
    architecture: MemoryArchitecture.UNIFIED_MEMORY,
    maxMemoryUtilization: 0.70,
    systemReserve: 0.20,
  },
  [MemoryArchitecture.REMOTE_GPU]: {
    architecture: MemoryArchitecture.REMOTE_GPU,
    maxMemoryUtilization: 0.80,
    systemReserve: 0.10,
  },
};

function detectMemoryArchitecture(): MemoryArchitecture {
  const platform = os.platform();
  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);

  if (platform === "darwin") {
    const isAppleSilicon = isAppleSiliconMac();
    if (isAppleSilicon) {
      console.log(`[Memory] Detected Apple Silicon Mac with ${totalMemoryGB.toFixed(1)}GB unified memory`);
      return MemoryArchitecture.UNIFIED_MEMORY;
    }
  }

  if (platform === "linux" || platform === "win32") {
    const hasNvidiaGpu = checkNvidiaGpu();
    if (hasNvidiaGpu) {
      console.log(`[Memory] Detected NVIDIA GPU on ${platform}`);
      return MemoryArchitecture.LOCAL_GPU;
    }
  }

  const hasRemoteGpuConfig = checkRemoteGpuConfig();
  if (hasRemoteGpuConfig) {
    console.log(`[Memory] Detected remote GPU configuration`);
    return MemoryArchitecture.REMOTE_GPU;
  }

  console.log(`[Memory] Defaulting to LOCAL_GPU architecture`);
  return MemoryArchitecture.LOCAL_GPU;
}

function isAppleSiliconMac(): boolean {
  try {
    const cpuInfo = os.cpus();
    if (cpuInfo.length > 0) {
      const model = cpuInfo[0].model || "";
      if (model.includes("Apple") || model.includes("M1") || model.includes("M2") || model.includes("M3") || model.includes("M4")) {
        return true;
      }
    }
    
    if (process.env.VLLM_REMOTE_GPU === "true") {
      return false;
    }
    
    return false;
  } catch {
    return false;
  }
}

function checkNvidiaGpu(): boolean {
  try {
    execSync("nvidia-smi", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function checkRemoteGpuConfig(): boolean {
  if (process.env.VLLM_REMOTE_GPU === "true") {
    return true;
  }
  
  if (process.env.VLLM_REMOTE_HOST || process.env.VLLM_SSH_HOST) {
    return true;
  }

  try {
    const configDir = resolveOpenClawAgentDir();
    const configPath = join(configDir, VLLM_MODELS_CONFIG_FILENAME);
    
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const models = JSON.parse(content) as VllmModelListEntry[];
      
      for (const model of models) {
        if (model.server?.type === "remote") {
          return true;
        }
        if (model.server?.ssh?.enabled) {
          return true;
        }
      }
    }
  } catch (err) {
    console.error("[Memory] Error checking vLLM config for remote GPU:", err);
  }
  
  return false;
}

const detectedArchitecture = detectMemoryArchitecture();
const currentMemoryConfig = { ...DEFAULT_MEMORY_CONFIGS[detectedArchitecture] };

console.log(`[Memory] Initialized with ${detectedArchitecture} architecture`);

export function setMemoryArchitecture(architecture: MemoryArchitecture): void {
  const config = DEFAULT_MEMORY_CONFIGS[architecture];
  if (config) {
    currentMemoryConfig.architecture = config.architecture;
    currentMemoryConfig.maxMemoryUtilization = config.maxMemoryUtilization;
    currentMemoryConfig.systemReserve = config.systemReserve;
    console.log(`[Memory] Set architecture to ${architecture}, max: ${config.maxMemoryUtilization * 100}%, reserve: ${config.systemReserve * 100}%`);
  }
}

export function getMemoryArchitecture(): MemoryArchitecture {
  return currentMemoryConfig.architecture;
}

export function getEffectiveMaxMemory(): number {
  return currentMemoryConfig.maxMemoryUtilization - currentMemoryConfig.systemReserve;
}

export function setCustomMemoryLimit(maxUtilization: number, systemReserve: number = 0.1): void {
  currentMemoryConfig.maxMemoryUtilization = Math.min(1, Math.max(0.1, maxUtilization));
  currentMemoryConfig.systemReserve = Math.min(0.5, Math.max(0, systemReserve));
}

export function getModelKey(endpoint: { provider: string; baseUrl: string; model: string }): string {
  return `${endpoint.provider}:${endpoint.baseUrl}:${endpoint.model}`;
}

export function getUsedMemoryForProvider(provider: string, baseUrl: string): number {
  return activeMemoryUsage.get(`${provider}:${baseUrl}`) ?? 0;
}

export function addMemoryUsage(
  subagentId: string,
  endpoint: { provider: string; baseUrl: string; model: string },
  gpuMemoryUtilization: number,
): void {
  const key = `${endpoint.provider}:${endpoint.baseUrl}`;
  const currentUsage = activeMemoryUsage.get(key) ?? 0;
  activeMemoryUsage.set(key, currentUsage + gpuMemoryUtilization);
}

export function subtractMemoryUsage(
  subagentId: string,
  endpoint: { provider: string; baseUrl: string; model: string },
  gpuMemoryUtilization: number,
): void {
  const key = `${endpoint.provider}:${endpoint.baseUrl}`;
  const currentUsage = activeMemoryUsage.get(key) ?? 0;
  const newUsage = Math.max(0, currentUsage - gpuMemoryUtilization);
  if (newUsage === 0) {
    activeMemoryUsage.delete(key);
  } else {
    activeMemoryUsage.set(key, newUsage);
  }
}

export function canUseMemory(
  endpoint: { provider: string; baseUrl: string },
  gpuMemoryUtilization: number,
): boolean {
  if (endpoint.provider !== "vllm" && endpoint.provider !== "sglang") {
    return true;
  }

  const key = `${endpoint.provider}:${endpoint.baseUrl}`;
  const currentUsage = activeMemoryUsage.get(key) ?? 0;
  const maxMemory = getEffectiveMaxMemory();
  return (currentUsage + gpuMemoryUtilization) <= maxMemory;
}

export function hasModelConflict(
  subagentId: string,
  endpoint: { provider: string; baseUrl: string; model: string },
  requesterSessionKey: string,
  gpuMemoryUtilization?: number,
): { hasConflict: boolean; reason?: string } {
  if (endpoint.provider !== "vllm" && endpoint.provider !== "sglang") {
    return { hasConflict: false };
  }

  const modelKey = getModelKey(endpoint);

  const activeRuns = listSubagentRunsForRequester(requesterSessionKey);
  for (const run of activeRuns) {
    if (!run.endedAt) {
      const existingSlot = activeModelSlots.get(requesterSessionKey);
      if (existingSlot && existingSlot.has(modelKey)) {
        return { hasConflict: true, reason: `Model ${endpoint.model} is already running` };
      }
    }
  }

  const modelSlots = activeModelSlots.get(requesterSessionKey);
  if (modelSlots && modelSlots.has(modelKey)) {
    return { hasConflict: true, reason: `Model ${endpoint.model} slot already occupied` };
  }

  if (gpuMemoryUtilization !== undefined && !canUseMemory(endpoint, gpuMemoryUtilization)) {
    const key = `${endpoint.provider}:${endpoint.baseUrl}`;
    const currentUsage = activeMemoryUsage.get(key) ?? 0;
    const maxMemory = getEffectiveMaxMemory();
    return {
      hasConflict: true,
      reason: `Insufficient GPU memory: would use ${((currentUsage + gpuMemoryUtilization) * 100).toFixed(0)}% (max ${(maxMemory * 100).toFixed(0)}%)`,
    };
  }

  return { hasConflict: false };
}

export function registerToWaitingQueue(
  subagentId: string,
  runId: string,
  task: string,
  label: string | undefined,
  endpoint: { provider: string; baseUrl: string; model: string },
  requesterSessionKey: string,
  gpuMemoryUtilization: number = 0.9,
): Promise<string> {
  const modelKey = getModelKey(endpoint);

  return new Promise((resolve, reject) => {
    const waiter: WaitingSubagent = {
      runId,
      subagentId,
      task,
      label,
      modelKey,
      gpuMemoryUtilization,
      requestedAt: Date.now(),
      resolve,
      reject,
    };

    if (!waitingQueue.has(requesterSessionKey)) {
      waitingQueue.set(requesterSessionKey, []);
    }
    waitingQueue.get(requesterSessionKey)!.push(waiter);

    console.log(`[Concurrency] Subagent ${subagentId} (runId: ${runId}) registered to waiting queue for model ${modelKey}`);
  });
}

export function activateModelSlot(
  subagentId: string,
  runId: string,
  endpoint: { provider: string; baseUrl: string; model: string },
  requesterSessionKey: string,
): void {
  const modelKey = getModelKey(endpoint);

  if (!activeModelSlots.has(requesterSessionKey)) {
    activeModelSlots.set(requesterSessionKey, new Set());
  }
  activeModelSlots.get(requesterSessionKey)!.add(modelKey);

  console.log(`[Concurrency] Activated slot for model ${modelKey} (subagent: ${subagentId}, runId: ${runId})`);
}

export function releaseModelSlot(
  subagentId: string,
  endpoint: { provider: string; baseUrl: string; model: string },
  requesterSessionKey: string,
): void {
  const modelKey = getModelKey(endpoint);
  const slots = activeModelSlots.get(requesterSessionKey);

  if (slots) {
    slots.delete(modelKey);
    if (slots.size === 0) {
      activeModelSlots.delete(requesterSessionKey);
    }
  }

  console.log(`[Concurrency] Released slot for model ${modelKey} (subagent: ${subagentId})`);

  notifyNextInQueue(requesterSessionKey);
}

function notifyNextInQueue(requesterSessionKey: string): void {
  const queue = waitingQueue.get(requesterSessionKey);
  if (!queue || queue.length === 0) {
    return;
  }

  const slots = activeModelSlots.get(requesterSessionKey) ?? new Set();

  const waitingIndex = queue.findIndex((waiter) => !slots.has(waiter.modelKey));

  if (waitingIndex === -1) {
    console.log(`[Concurrency] All waiting subagents conflict with active models for session ${requesterSessionKey}`);
    return;
  }

  const nextWaiter = queue.splice(waitingIndex, 1)[0];

  console.log(`[Concurrency] Notifying next subagent: ${nextWaiter.subagentId} (runId: ${nextWaiter.runId})`);

  setTimeout(() => {
    nextWaiter.resolve(nextWaiter.runId);
  }, 100);
}

export function removeFromWaitingQueue(
  runId: string,
  requesterSessionKey: string,
): boolean {
  const queue = waitingQueue.get(requesterSessionKey);
  if (!queue) {
    return false;
  }

  const index = queue.findIndex((w) => w.runId === runId);
  if (index !== -1) {
    const removed = queue.splice(index, 1)[0];
    console.log(`[Concurrency] Removed subagent ${removed.subagentId} from waiting queue`);

    if (queue.length === 0) {
      waitingQueue.delete(requesterSessionKey);
    }
    return true;
  }

  return false;
}

export function getWaitingCount(requesterSessionKey: string): number {
  const queue = waitingQueue.get(requesterSessionKey);
  return queue?.length ?? 0;
}

export function getWaitingInfo(requesterSessionKey: string): WaitingSubagent[] {
  return waitingQueue.get(requesterSessionKey) ?? [];
}

export function clearWaitingQueue(requesterSessionKey: string): void {
  const queue = waitingQueue.get(requesterSessionKey);
  if (queue) {
    for (const waiter of queue) {
      waiter.reject(new Error("Session ended, waiting queue cleared"));
    }
  }
  waitingQueue.delete(requesterSessionKey);
  activeModelSlots.delete(requesterSessionKey);
  console.log(`[Concurrency] Cleared waiting queue for session ${requesterSessionKey}`);
}

export interface SubagentTaskInfo {
  subagentId: string;
  modelProvider: string;
  gpuMemoryUtilization: number;
  dependsOn?: string;
}

export interface SchedulingDecision {
  strategy: "parallel" | "sequential";
  executionOrder: string[];
  canRun: boolean;
  reason: string;
}

export function analyzeTaskDependencies(tasks: SubagentTaskInfo[]): SchedulingDecision {
  if (tasks.length <= 1) {
    return {
      strategy: "parallel",
      executionOrder: tasks.map((t) => t.subagentId),
      canRun: true,
      reason: tasks.length === 0 ? "No tasks" : "Single task",
    };
  }

  const hasDependencies = tasks.some((t) => t.dependsOn !== undefined);
  if (!hasDependencies) {
    return {
      strategy: "parallel",
      executionOrder: tasks.map((t) => t.subagentId),
      canRun: true,
      reason: "No dependencies between tasks",
    };
  }

  const orderedTasks: string[] = [];
  const remaining = new Set(tasks.map((t) => t.subagentId));
  const visited = new Set<string>();

  while (remaining.size > 0) {
    let progress = false;

    for (const task of tasks) {
      if (!remaining.has(task.subagentId)) {
        continue;
      }

      if (task.dependsOn && remaining.has(task.dependsOn)) {
        continue;
      }

      orderedTasks.push(task.subagentId);
      remaining.delete(task.subagentId);
      visited.add(task.subagentId);
      progress = true;
    }

    if (!progress && remaining.size > 0) {
      return {
        strategy: "sequential",
        executionOrder: Array.from(remaining),
        canRun: false,
        reason: "Circular dependency detected",
      };
    }
  }

  return {
    strategy: "sequential",
    executionOrder: orderedTasks,
    canRun: true,
    reason: "Tasks have dependencies, must execute sequentially",
  };
}

export function checkMemoryForTasks(tasks: SubagentTaskInfo[]): {
  canParallel: boolean;
  maxConcurrent: number;
  reason: string;
} {
  const vllmTasks = tasks.filter(
    (t) => t.modelProvider === "vllm" || t.modelProvider === "sglang",
  );

  if (vllmTasks.length === 0) {
    return { canParallel: true, maxConcurrent: 999, reason: "No vLLM/SGLang tasks" };
  }

  const maxMemory = getEffectiveMaxMemory();
  let bestCount = 0;

  for (let i = 1; i <= vllmTasks.length; i++) {
    const combinations = getCombinations(vllmTasks, i);
    for (const combo of combinations) {
      const totalMemory = combo.reduce((sum, t) => sum + t.gpuMemoryUtilization, 0);
      if (totalMemory <= maxMemory) {
        bestCount = Math.max(bestCount, i);
      }
    }
    if (bestCount >= vllmTasks.length) {
      break;
    }
  }

  if (bestCount >= vllmTasks.length) {
    return { canParallel: true, maxConcurrent: vllmTasks.length, reason: "All tasks fit in memory" };
  }

  return {
    canParallel: false,
    maxConcurrent: bestCount,
    reason: `Only ${bestCount} of ${vllmTasks.length} tasks can run in parallel (memory: ${(maxMemory * 100).toFixed(0)}%)`,
  };
}

function getCombinations<T>(arr: T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (arr.length < count) return [];

  const result: T[][] = [];
  const first = arr[0];
  const rest = arr.slice(1);

  const withFirst = getCombinations(rest, count - 1).map((c) => [first, ...c]);
  result.push(...withFirst);

  const withoutFirst = getCombinations(rest, count);
  result.push(...withoutFirst);

  return result;
}

export function createSchedulingDecision(
  tasks: SubagentTaskInfo[],
): SchedulingDecision {
  const dependencyAnalysis = analyzeTaskDependencies(tasks);

  if (!dependencyAnalysis.canRun) {
    return dependencyAnalysis;
  }

  const memoryAnalysis = checkMemoryForTasks(tasks);

  if (dependencyAnalysis.strategy === "parallel" && memoryAnalysis.canParallel) {
    return {
      strategy: "parallel",
      executionOrder: tasks.map((t) => t.subagentId),
      canRun: true,
      reason: "No dependencies and sufficient memory",
    };
  }

  if (dependencyAnalysis.strategy === "sequential") {
    return {
      strategy: "sequential",
      executionOrder: dependencyAnalysis.executionOrder,
      canRun: true,
      reason: dependencyAnalysis.reason,
    };
  }

  return {
    strategy: "sequential",
    executionOrder: dependencyAnalysis.executionOrder,
    canRun: true,
    reason: `Memory constrained: ${memoryAnalysis.reason}`,
  };
}
