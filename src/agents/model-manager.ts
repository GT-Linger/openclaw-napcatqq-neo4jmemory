import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { ModelProvider, ModelEndpoint, SubagentBehavior } from "./subagent-config.js";

export interface ModelProcessEntry {
  id: string;
  subagentRunId?: string;
  subagentLabel?: string;
  endpoint: ModelEndpoint;
  provider: ModelProvider;
  process: ChildProcess | null;
  pid?: number;
  baseUrl: string;
  remotePid?: number;
  owner: "main" | "subagent";
  isPersistent: boolean;
  startedAt: number;
  status: "starting" | "running" | "stopping" | "stopped";
}

export interface ModelManagerConfig {
  basePort: number;
  defaultTimeout: number;
  healthCheckTimeout: number;
  shutdownTimeout: number;
}

const DEFAULT_CONFIG: ModelManagerConfig = {
  basePort: 8000,
  defaultTimeout: 60000,
  healthCheckTimeout: 300000,
  shutdownTimeout: 30000,
};

const PROVIDER_PORTS: Record<ModelProvider, number> = {
  vllm: 8000,
  sglang: 8000,
  ollama: 11434,
  openai: 8000,
  anthropic: 8000,
  custom: 8000,
};

const PROVIDER_DEFAULTS: Record<ModelProvider, { path: string; args: (port: number, model: string) => string[] }> = {
  vllm: {
    path: "vllm",
    args: (port, model) => [
      "serve", model,
      "--host", "0.0.0.0",
      "--port", String(port),
    ],
  },
  sglang: {
    path: "sglang",
    args: (port, model) => [
      "serve", model,
      "--host", "0.0.0.0",
      "--port", String(port),
    ],
  },
  ollama: {
    path: "ollama",
    args: (port, model) => ["serve"],
  },
  openai: {
    path: "openai-api-server",
    args: (port, model) => ["--port", String(port), "--model", model],
  },
  anthropic: {
    path: "anthropic-api",
    args: (port, model) => ["--port", String(port)],
  },
  custom: {
    path: "custom-server",
    args: (port, model) => ["--port", String(port), "--model", model],
  },
};

class UnifiedModelManager {
  private processes = new Map<string, ModelProcessEntry>();
  private config: ModelManagerConfig;
  private portCounter = 0;
  private lockIds = new Set<string>();

  constructor(config: Partial<ModelManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getNextPort(provider: ModelProvider): number {
    this.portCounter++;
    const basePort = this.config.basePort + PROVIDER_PORTS[provider] % 1000;
    return basePort + this.portCounter;
  }

  private async checkHealth(baseUrl: string, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${baseUrl}/v1/models`, {
          method: "GET",
        });
        if (response.ok) {
          return true;
        }
      } catch {
        try {
          const ollamaResponse = await fetch(`${baseUrl}/api/tags`);
          if (ollamaResponse.ok) {
            return true;
          }
        } catch {
        }
        await this.sleep(2000);
      }
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getBaseUrl(endpoint: ModelEndpoint): string {
    let baseUrl = endpoint.baseUrl.replace(/\/$/, "");
    if (!baseUrl.includes("/v1") && endpoint.provider !== "ollama") {
      baseUrl = `${baseUrl}/v1`;
    }
    return baseUrl;
  }

  async startModel(params: {
    id: string;
    subagentRunId?: string;
    subagentLabel?: string;
    endpoint: ModelEndpoint;
    behavior?: SubagentBehavior;
    owner?: "main" | "subagent";
    isPersistent?: boolean;
  }): Promise<ModelProcessEntry> {
    const { id, subagentRunId, subagentLabel, endpoint, behavior, owner = "subagent", isPersistent = false } = params;
    const entryId = subagentRunId ? `subagent:${subagentRunId}` : `main:${id}`;

    if (this.processes.has(entryId)) {
      const existing = this.processes.get(entryId)!;
      if (existing.status === "running") {
        return existing;
      }
    }

    while (this.lockIds.has(entryId)) {
      await this.sleep(500);
    }
    this.lockIds.add(entryId);

    try {
      const port = endpoint.port ?? this.getNextPort(endpoint.provider);
      const baseUrl = this.getBaseUrl({ ...endpoint, baseUrl: endpoint.baseUrl.includes(":") 
        ? endpoint.baseUrl 
        : `${endpoint.baseUrl}:${port}` });

      const processEntry: ModelProcessEntry = {
        id: entryId,
        subagentRunId,
        subagentLabel,
        endpoint,
        provider: endpoint.provider,
        process: null,
        baseUrl,
        owner,
        isPersistent,
        startedAt: Date.now(),
        status: "starting",
      };

      if (endpoint.provider === "ollama") {
        console.log(`[Model] Ollama detected, assuming server is already running at ${baseUrl}`);
        processEntry.status = "running";
        this.processes.set(entryId, processEntry);
        return processEntry;
      }

      if (endpoint.provider === "openai" || endpoint.provider === "anthropic" || endpoint.provider === "custom") {
        console.log(`[Model] ${endpoint.provider} endpoint: ${baseUrl} (no local process needed)`);
        processEntry.status = "running";
        this.processes.set(entryId, processEntry);
        return processEntry;
      }

      const providerConfig = PROVIDER_DEFAULTS[endpoint.provider];
      const args = providerConfig.args(port, endpoint.model);

      processEntry.process = spawn(providerConfig.path, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(behavior?.gpuMemoryUtilization ? { GPU_MEMORY_UTILIZATION: String(behavior.gpuMemoryUtilization) } : {}),
          ...(behavior?.maxModelLen ? { MAX_MODEL_LEN: String(behavior.maxModelLen) } : {}),
          ...(behavior?.tensorParallelSize ? { TENSOR_PARALLEL_SIZE: String(behavior.tensorParallelSize) } : {}),
        },
      });

      if (processEntry.process.stdout) {
        processEntry.process.stdout.on("data", (data: Buffer) => {
          const output = data.toString();
          if (output.includes("Started server process") || output.includes("Uvicorn running on")) {
            console.log(`[Model] ${endpoint.provider} server started on port ${port}`);
          }
        });
      }

      if (processEntry.process.stderr) {
        processEntry.process.stderr.on("data", (data: Buffer) => {
          console.error(`[Model] ${endpoint.provider} stderr: ${data.toString()}`);
        });
      }

      processEntry.pid = processEntry.process.pid;

      console.log(`[Model] Starting ${endpoint.provider} for ${entryId} on port ${port}`);

      const healthOk = await this.checkHealth(baseUrl, this.config.healthCheckTimeout);
      if (!healthOk) {
        processEntry.status = "stopped";
        this.processes.delete(entryId);
        throw new Error(`Model health check failed for ${entryId}`);
      }

      processEntry.status = "running";
      this.processes.set(entryId, processEntry);
      return processEntry;
    } finally {
      this.lockIds.delete(entryId);
    }
  }

  async stopModel(subagentRunId: string): Promise<boolean> {
    const entryId = `subagent:${subagentRunId}`;
    const processEntry = this.processes.get(entryId);
    
    if (!processEntry) {
      return true;
    }

    if (processEntry.status === "stopping" || processEntry.status === "stopped") {
      return true;
    }

    if (processEntry.isPersistent) {
      console.log(`[Model] Skipping stop for persistent model ${subagentRunId}`);
      return false;
    }

    if (processEntry.owner === "main") {
      console.log(`[Model] Skipping stop for main agent model ${subagentRunId}`);
      return false;
    }

    processEntry.status = "stopping";

    if (processEntry.process) {
      await this.stopLocalProcess(processEntry);
    }

    processEntry.status = "stopped";
    this.processes.delete(entryId);
    console.log(`[Model] Stopped model for ${subagentRunId}`);
    return true;
  }

  private async stopLocalProcess(processEntry: ModelProcessEntry): Promise<void> {
    if (!processEntry.process) return;

    const pid = processEntry.process.pid;
    if (!pid) return;

    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/F", "/T", "/PID", String(pid)]);
      } else {
        process.kill(pid, "SIGTERM");
      }

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (processEntry.process?.pid) {
            try {
              process.kill(processEntry.process.pid, "SIGKILL");
            } catch {
            }
          }
          resolve();
        }, this.config.shutdownTimeout);

        processEntry.process?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (err) {
      console.error(`[Model] Error stopping process for ${processEntry.id}:`, err);
    }
  }

  async stopAllSubagentModels(): Promise<void> {
    const entries = Array.from(this.processes.values())
      .filter(p => p.owner === "subagent" && !p.isPersistent);
    
    for (const entry of entries) {
      if (entry.subagentRunId) {
        await this.stopModel(entry.subagentRunId);
      }
    }
  }

  async stopAll(force: boolean = false): Promise<void> {
    const entries = Array.from(this.processes.values());
    
    for (const entry of entries) {
      if (entry.owner === "main" && !force) {
        continue;
      }
      
      if (entry.subagentRunId) {
        await this.stopModel(entry.subagentRunId);
      } else if (entry.status === "running") {
        await this.stopLocalProcess(entry);
        entry.status = "stopped";
        this.processes.delete(entry.id);
      }
    }
  }

  getProcess(id: string): ModelProcessEntry | undefined {
    return this.processes.get(id);
  }

  getSubagentProcess(subagentRunId: string): ModelProcessEntry | undefined {
    return this.processes.get(`subagent:${subagentRunId}`);
  }

  getAllProcesses(): ModelProcessEntry[] {
    return Array.from(this.processes.values());
  }

  isRunning(id: string): boolean {
    const entry = this.processes.get(id);
    return entry?.status === "running";
  }

  isSubagentRunning(subagentRunId: string): boolean {
    return this.isRunning(`subagent:${subagentRunId}`);
  }

  getBaseUrl(subagentRunId: string): string | null {
    const entry = this.processes.get(`subagent:${subagentRunId}`);
    return entry?.baseUrl ?? null;
  }

  canStop(subagentRunId: string): boolean {
    const entry = this.processes.get(`subagent:${subagentRunId}`);
    if (!entry) return false;
    if (entry.isPersistent) return false;
    if (entry.owner === "main") return false;
    return true;
  }
}

let globalManager: UnifiedModelManager | null = null;

export function getModelManager(config?: Partial<ModelManagerConfig>): UnifiedModelManager {
  if (!globalManager) {
    globalManager = new UnifiedModelManager(config);
  }
  return globalManager;
}

export function resetModelManager(): void {
  globalManager = null;
}

export { PROVIDER_PORTS, PROVIDER_DEFAULTS };
