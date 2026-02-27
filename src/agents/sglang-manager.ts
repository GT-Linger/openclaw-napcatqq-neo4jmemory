import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

export interface SglangModelConfig {
  id: string;
  name: string;
  modelPath: string;
  baseUrl: string;
  server?: SglangServerConfig;
  apiKey?: string;
  gpuMemoryUtilization?: number;
  maxModelLen?: number;
  tensorParallelSize?: number;
  port?: number;
  env?: Record<string, string>;
  isMainAgent?: boolean;
  isSubagentOnly?: boolean;
  deploymentType?: "command" | "docker";
}

export interface SglangServerConfig {
  type: "local" | "remote" | "docker";
  host?: string;
  port?: number;
  ssh?: {
    host: string;
    port?: number;
    username?: string;
    privateKeyPath?: string;
  };
  docker?: {
    enabled: boolean;
    image: string;
    containerName?: string;
    gpuDevices?: string;
    volumes?: string[];
    envVars?: Record<string, string>;
    extraArgs?: string;
  };
}

export type SglangServerType = "local" | "remote" | "docker";

export interface SglangProcessEntry {
  id: string;
  subagentRunId?: string;
  subagentLabel?: string;
  modelId: string;
  modelConfig: SglangModelConfig;
  process: ChildProcess | null;
  pid?: number;
  baseUrl: string;
  serverType: SglangServerType;
  remotePid?: number;
  containerId?: string;
  owner: "main" | "subagent";
  isPersistent: boolean;
  startedAt: number;
  status: "starting" | "running" | "stopping" | "stopped";
}

export interface SglangManagerConfig {
  basePort: number;
  defaultGpuMemoryUtilization: number;
  defaultMaxModelLen: number;
  defaultTensorParallelSize: number;
  sglangCommand: string;
  healthCheckTimeout: number;
  shutdownTimeout: number;
}

const DEFAULT_CONFIG: SglangManagerConfig = {
  basePort: 9000,
  defaultGpuMemoryUtilization: 0.9,
  defaultMaxModelLen: 32768,
  defaultTensorParallelSize: 1,
  sglangCommand: "sglang",
  healthCheckTimeout: 300000,
  shutdownTimeout: 30000,
};

class SglangModelManager {
  private processes = new Map<string, SglangProcessEntry>();
  private config: SglangManagerConfig;
  private portCounter = 0;
  private lockIds = new Set<string>();

  constructor(config: Partial<SglangManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getNextPort(): number {
    this.portCounter++;
    return this.config.basePort + this.portCounter;
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
        await this.sleep(2000);
      }
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveServerConfig(modelConfig: SglangModelConfig): {
    type: SglangServerType;
    host: string;
    port: number;
    ssh?: SglangServerConfig["ssh"];
    docker?: SglangServerConfig["docker"];
  } {
    const serverConfig = modelConfig.server;
    const deploymentType = modelConfig.deploymentType;
    
    let type: SglangServerType;
    if (deploymentType === "docker") {
      type = "docker";
    } else {
      type = serverConfig?.type ?? "local";
    }
    
    const host = serverConfig?.host ?? modelConfig.baseUrl.replace(/^http(s)?:\/\//, "").split(":")[0] ?? "127.0.0.1";
    const port = serverConfig?.port ?? modelConfig.port ?? this.getNextPort();

    return {
      type,
      host,
      port,
      ssh: serverConfig?.ssh,
      docker: serverConfig?.docker,
    };
  }

  private buildSglangArgs(port: number, modelConfig: SglangModelConfig): string[] {
    const args = [
      "serve",
      modelConfig.modelPath,
      "--host", "0.0.0.0",
      "--port", String(port),
      "--gpu-memory-utilization",
      String(modelConfig.gpuMemoryUtilization ?? this.config.defaultGpuMemoryUtilization),
      "--max-model-len",
      String(modelConfig.maxModelLen ?? this.config.defaultMaxModelLen),
    ];

    if (modelConfig.tensorParallelSize && modelConfig.tensorParallelSize > 1) {
      args.push("--tensor-parallel-size", String(modelConfig.tensorParallelSize));
    }

    return args;
  }

  private buildDockerArgs(port: number, modelConfig: SglangModelConfig): string[] {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = [
      "run",
      "--rm",
      "-d",
      "--name", dockerConfig.containerName || `sglang-${modelConfig.id}-${port}`,
      "-p", `${port}:${port}`,
    ];

    if (dockerConfig.gpuDevices) {
      args.push("--gpus", `"device=${dockerConfig.gpuDevices}"`);
    } else {
      args.push("--gpus", "all");
    }

    if (dockerConfig.volumes && dockerConfig.volumes.length > 0) {
      for (const vol of dockerConfig.volumes) {
        args.push("-v", vol);
      }
    }

    if (dockerConfig.envVars) {
      for (const [key, value] of Object.entries(dockerConfig.envVars)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push("-e", `SGLANG_SERVER_PORT=${port}`);

    if (modelConfig.gpuMemoryUtilization) {
      args.push("-e", `SGLANG_GPU_MEMORY_UTILIZATION=${modelConfig.gpuMemoryUtilization}`);
    }
    if (modelConfig.maxModelLen) {
      args.push("-e", `SGLANG_MAX_MODEL_LEN=${modelConfig.maxModelLen}`);
    }

    if (dockerConfig.extraArgs) {
      args.push(...dockerConfig.extraArgs.split(" ").filter(Boolean));
    }

    args.push(dockerConfig.image);
    args.push("sglang", "serve", "--host", "0.0.0.0", "--port", String(port), modelConfig.modelPath);

    if (modelConfig.tensorParallelSize && modelConfig.tensorParallelSize > 1) {
      args.push("--tp", String(modelConfig.tensorParallelSize));
    }

    return args;
  }

  private async startLocalDocker(
    port: number,
    modelConfig: SglangModelConfig,
    processEntry: SglangProcessEntry,
  ): Promise<void> {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = this.buildDockerArgs(port, modelConfig);
    const containerName = dockerConfig.containerName || `sglang-${modelConfig.id}-${port}`;

    console.log(`[SGLang] Starting local Docker SGLang: docker ${args.join(" ")}`);

    processEntry.process = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (processEntry.process.stdout) {
      processEntry.process.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`[SGLang] Docker stdout: ${output}`);
      });
    }

    if (processEntry.process.stderr) {
      processEntry.process.stderr.on("data", (data: Buffer) => {
        console.error(`[SGLang] Docker stderr: ${data.toString()}`);
      });
    }

    processEntry.pid = processEntry.process.pid;
    processEntry.containerId = containerName;
  }

  private async startRemoteDocker(
    host: string,
    port: number,
    modelConfig: SglangModelConfig,
    sshConfig: SglangServerConfig["ssh"],
    processEntry: SglangProcessEntry,
  ): Promise<void> {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = this.buildDockerArgs(port, modelConfig);
    const containerName = dockerConfig.containerName || `sglang-${modelConfig.id}-${port}`;
    const dockerArgsStr = args.join(" ");

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=accept-new",
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `docker ${dockerArgsStr}`,
    ];

    console.log(`[SGLang] Starting remote Docker SGLang on ${sshUser}@${sshHost}:${port}`);

    const containerProcess = spawn("ssh", sshArgs, { stdio: ["ignore", "pipe", "pipe"] });

    let containerId = "";

    if (containerProcess.stdout) {
      containerProcess.stdout.on("data", (data: Buffer) => {
        containerId += data.toString();
      });
    }

    if (containerProcess.stderr) {
      containerProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[SGLang] SSH Docker stderr: ${data.toString()}`);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        containerProcess.kill();
        reject(new Error(`Docker start timeout`));
      }, 60000);

      containerProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          processEntry.containerId = containerId.trim().substring(0, 12);
          console.log(`[SGLang] Remote Docker SGLang started with container ${processEntry.containerId}`);
          resolve();
        } else {
          reject(new Error(`Docker start failed with code ${code}`));
        }
      });
    });
  }

  private async stopLocalDocker(processEntry: SglangProcessEntry): Promise<void> {
    const containerId = processEntry.containerId;
    if (!containerId) {
      console.warn(`[SGLang] No container ID for ${processEntry.id}`);
      return;
    }

    console.log(`[SGLang] Stopping local Docker SGLang: ${containerId}`);

    const stopProcess = spawn("docker", ["stop", containerId], { stdio: ["ignore", "pipe", "pipe"] });

    await new Promise<void>((resolve) => {
      stopProcess.on("close", () => resolve());
    });
  }

  private async stopRemoteDocker(
    host: string,
    sshConfig: SglangServerConfig["ssh"],
    processEntry: SglangProcessEntry,
  ): Promise<void> {
    const containerId = processEntry.containerId;
    if (!containerId) {
      console.warn(`[SGLang] No container ID for ${processEntry.id}`);
      return;
    }

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `docker stop ${containerId}`,
    ];

    console.log(`[SGLang] Stopping remote Docker SGLang: ${containerId}`);

    spawn("ssh", sshArgs, { stdio: "ignore" });
    await this.sleep(2000);
  }

  private async startLocalSglang(port: number, modelConfig: SglangModelConfig, processEntry: SglangProcessEntry): Promise<void> {
    const args = this.buildSglangArgs(port, modelConfig);
    const modelPath = modelConfig.modelPath;

    processEntry.process = spawn(
      this.config.sglangCommand,
      [modelPath, ...args.slice(1)],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...modelConfig.env,
        },
      },
    );

    if (processEntry.process.stdout) {
      processEntry.process.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        if (output.includes("Started server process") || output.includes("Uvicorn running on")) {
          console.log(`[SGLang] Server started on port ${port}`);
        }
      });
    }

    if (processEntry.process.stderr) {
      processEntry.process.stderr.on("data", (data: Buffer) => {
        console.error(`[SGLang] stderr: ${data.toString()}`);
      });
    }

    processEntry.pid = processEntry.process.pid;
  }

  private async startRemoteSglang(
    host: string,
    port: number,
    modelConfig: SglangModelConfig,
    sshConfig: SglangServerConfig["ssh"],
    processEntry: SglangProcessEntry,
  ): Promise<void> {
    const args = this.buildSglangArgs(port, modelConfig);
    const sglangCommand = "sglang";
    const argsStr = args.join(" ");

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `nohup ${sglangCommand} ${argsStr} > /tmp/sglang-${processEntry.id}.log 2>&1 &`,
      "echo $!",
    ];

    console.log(`[SGLang] Starting remote SGLang on ${sshUser}@${sshHost}:${port}`);

    const pidProcess = spawn("ssh", sshArgs, { stdio: ["ignore", "pipe", "pipe"] });

    let pidOutput = "";
    if (pidProcess.stdout) {
      pidProcess.stdout.on("data", (data: Buffer) => {
        pidOutput += data.toString();
      });
    }

    await new Promise<void>((resolve, reject) => {
      pidProcess.on("close", (code) => {
        if (code === 0) {
          const pid = pidOutput.trim();
          processEntry.remotePid = parseInt(pid, 10);
          resolve();
        } else {
          reject(new Error(`SSH command failed with code ${code}`));
        }
      });
      pidProcess.on("error", reject);
    });
  }

  private async stopRemoteSglang(
    host: string,
    sshConfig: SglangServerConfig["ssh"],
    processEntry: SglangProcessEntry,
  ): Promise<void> {
    if (!processEntry.remotePid) {
      console.warn(`[SGLang] No remote PID for ${processEntry.id}`);
      return;
    }

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `kill ${processEntry.remotePid} 2>/dev/null || true`,
    ];

    console.log(`[SGLang] Stopping remote SGLang (PID: ${processEntry.remotePid})`);

    spawn("ssh", sshArgs, { stdio: "ignore" });
    await this.sleep(1000);
  }

  async startMainAgentSglang(modelConfig: SglangModelConfig): Promise<SglangProcessEntry> {
    const modelId = modelConfig.id;

    if (this.processes.has(`main:${modelId}`)) {
      const existing = this.processes.get(`main:${modelId}`)!;
      if (existing.status === "running") {
        return existing;
      }
    }

    const entryId = `main:${modelId}`;
    while (this.lockIds.has(entryId)) {
      await this.sleep(500);
    }
    this.lockIds.add(entryId);

    try {
      const serverConfig = this.resolveServerConfig(modelConfig);
      const { type, host, port, ssh, docker } = serverConfig;

      const baseUrl = `http://${host}:${port}/v1`;

      const processEntry: SglangProcessEntry = {
        id: entryId,
        modelId,
        modelConfig,
        process: null,
        baseUrl,
        serverType: type,
        owner: "main",
        isPersistent: true,
        startedAt: Date.now(),
        status: "starting",
      };

      console.log(`[SGLang] Starting main agent SGLang with model ${modelId} on ${host}:${port} (persistent)`);

      if (type === "local") {
        await this.startLocalSglang(port, modelConfig, processEntry);
      } else if (type === "docker") {
        if (ssh) {
          await this.startRemoteDocker(host, port, modelConfig, ssh, processEntry);
        } else {
          await this.startLocalDocker(port, modelConfig, processEntry);
        }
      } else {
        await this.startRemoteSglang(host, port, modelConfig, ssh, processEntry);
      }

      const healthOk = await this.checkHealth(baseUrl, this.config.healthCheckTimeout);
      if (!healthOk) {
        processEntry.status = "stopped";
        throw new Error(`SGLang health check failed for main agent`);
      }

      processEntry.status = "running";
      this.processes.set(entryId, processEntry);
      return processEntry;
    } finally {
      this.lockIds.delete(entryId);
    }
  }

  async startSubagentSglang(params: {
    subagentRunId: string;
    subagentLabel: string;
    modelConfig: SglangModelConfig;
  }): Promise<SglangProcessEntry> {
    const { subagentRunId, subagentLabel, modelConfig } = params;
    const entryId = `subagent:${subagentRunId}`;

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
      const serverConfig = this.resolveServerConfig(modelConfig);
      const { type, host, port, ssh, docker } = serverConfig;

      const baseUrl = `http://${host}:${port}/v1`;

      const processEntry: SglangProcessEntry = {
        id: entryId,
        subagentRunId,
        subagentLabel,
        modelId: modelConfig.id,
        modelConfig,
        process: null,
        baseUrl,
        serverType: type,
        owner: "subagent",
        isPersistent: false,
        startedAt: Date.now(),
        status: "starting",
      };

      console.log(`[SGLang] Starting subagent ${subagentRunId} with model ${modelConfig.id} on ${host}:${port}`);

      if (type === "local") {
        await this.startLocalSglang(port, modelConfig, processEntry);
      } else if (type === "docker") {
        if (ssh) {
          await this.startRemoteDocker(host, port, modelConfig, ssh, processEntry);
        } else {
          await this.startLocalDocker(port, modelConfig, processEntry);
        }
      } else {
        await this.startRemoteSglang(host, port, modelConfig, ssh, processEntry);
      }

      const healthOk = await this.checkHealth(baseUrl, this.config.healthCheckTimeout);
      if (!healthOk) {
        processEntry.status = "stopped";
        this.processes.delete(entryId);
        throw new Error(`SGLang health check failed for subagent ${subagentRunId}`);
      }

      processEntry.status = "running";
      this.processes.set(entryId, processEntry);
      return processEntry;
    } finally {
      this.lockIds.delete(entryId);
    }
  }

  async stopSubagentSglang(subagentRunId: string): Promise<boolean> {
    const entryId = `subagent:${subagentRunId}`;
    const processEntry = this.processes.get(entryId);
    
    if (!processEntry) {
      return true;
    }

    if (processEntry.status === "stopping" || processEntry.status === "stopped") {
      return true;
    }

    if (processEntry.isPersistent) {
      console.log(`[SGLang] Skipping stop for persistent subagent ${subagentRunId}`);
      return false;
    }

    processEntry.status = "stopping";

    if (processEntry.serverType === "local") {
      await this.stopLocalSglang(processEntry);
    } else {
      const ssh = processEntry.modelConfig.server?.ssh;
      await this.stopRemoteSglang(processEntry.modelConfig.baseUrl, ssh, processEntry);
    }

    processEntry.status = "stopped";
    this.processes.delete(entryId);
    console.log(`[SGLang] Stopped subagent ${subagentRunId} SGLang process`);
    return true;
  }

  async stopAllSubagentSglang(): Promise<void> {
    const subagentEntries = Array.from(this.processes.values())
      .filter(p => p.owner === "subagent" && !p.isPersistent);
    
    const stopPromises = subagentEntries.map(p => {
      const runId = p.subagentRunId;
      if (runId) {
        return this.stopSubagentSglang(runId);
      }
      return Promise.resolve();
    });
    
    await Promise.all(stopPromises);
  }

  async stopAll(force: boolean = false): Promise<void> {
    const allEntries = Array.from(this.processes.values());
    
    for (const entry of allEntries) {
      if (entry.owner === "main" && !force) {
        console.log(`[SGLang] Skipping stop for main agent SGLang (use force=true to override)`);
        continue;
      }
      
      if (entry.owner === "subagent") {
        const runId = entry.subagentRunId;
        if (runId) {
          await this.stopSubagentSglang(runId);
        }
      } else if (entry.status === "running") {
        await this.stopEntry(entry);
      }
    }
  }

  private async stopEntry(processEntry: SglangProcessEntry): Promise<void> {
    if (processEntry.status === "stopping" || processEntry.status === "stopped") {
      return;
    }

    processEntry.status = "stopping";

    if (processEntry.serverType === "local") {
      await this.stopLocalSglang(processEntry);
    } else if (processEntry.serverType === "docker") {
      const ssh = processEntry.modelConfig.server?.ssh;
      if (ssh) {
        await this.stopRemoteDocker(processEntry.modelConfig.baseUrl, ssh, processEntry);
      } else {
        await this.stopLocalDocker(processEntry);
      }
    } else {
      const ssh = processEntry.modelConfig.server?.ssh;
      await this.stopRemoteSglang(processEntry.modelConfig.baseUrl, ssh, processEntry);
    }

    processEntry.status = "stopped";
    this.processes.delete(processEntry.id);
  }

  private async stopLocalSglang(processEntry: SglangProcessEntry): Promise<void> {
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
      console.error(`[SGLang] Error stopping process for ${processEntry.id}:`, err);
    }
  }

  getProcess(id: string): SglangProcessEntry | undefined {
    return this.processes.get(id);
  }

  getSubagentProcess(subagentRunId: string): SglangProcessEntry | undefined {
    return this.processes.get(`subagent:${subagentRunId}`);
  }

  getMainAgentProcess(modelId: string): SglangProcessEntry | undefined {
    return this.processes.get(`main:${modelId}`);
  }

  getAllProcesses(): SglangProcessEntry[] {
    return Array.from(this.processes.values());
  }

  getSubagentProcesses(): SglangProcessEntry[] {
    return Array.from(this.processes.values()).filter(p => p.owner === "subagent");
  }

  getMainAgentProcesses(): SglangProcessEntry[] {
    return Array.from(this.processes.values()).filter(p => p.owner === "main");
  }

  isProcessRunning(id: string): boolean {
    const entry = this.processes.get(id);
    return entry?.status === "running";
  }

  isSubagentSglangRunning(subagentRunId: string): boolean {
    return this.isProcessRunning(`subagent:${subagentRunId}`);
  }

  isMainAgentSglangRunning(modelId: string): boolean {
    return this.isProcessRunning(`main:${modelId}`);
  }

  getSubagentBaseUrl(subagentRunId: string): string | null {
    const entry = this.processes.get(`subagent:${subagentRunId}`);
    return entry?.baseUrl ?? null;
  }

  getMainAgentBaseUrl(modelId: string): string | null {
    const entry = this.processes.get(`main:${modelId}`);
    return entry?.baseUrl ?? null;
  }

  canStopSubagent(subagentRunId: string): boolean {
    const entry = this.processes.get(`subagent:${subagentRunId}`);
    if (!entry) return false;
    if (entry.isPersistent) return false;
    if (entry.owner === "main") return false;
    return true;
  }
}

let globalManager: SglangModelManager | null = null;

export function getSglangModelManager(config?: Partial<SglangManagerConfig>): SglangModelManager {
  if (!globalManager) {
    globalManager = new SglangModelManager(config);
  }
  return globalManager;
}

export function resetSglangModelManager(): void {
  globalManager = null;
}
