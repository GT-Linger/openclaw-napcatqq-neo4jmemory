import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { VllmServerConfig, VllmServerType } from "./subagent-vllm-config.js";

export interface VllmModelConfig {
  id: string;
  name: string;
  modelPath: string;
  baseUrl: string;
  server?: VllmServerConfig;
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

export interface VllmProcessEntry {
  id: string;
  subagentRunId?: string;
  subagentLabel?: string;
  modelId: string;
  modelConfig: VllmModelConfig;
  process: ChildProcess | null;
  pid?: number;
  baseUrl: string;
  serverType: VllmServerType;
  remotePid?: number;
  containerId?: string;
  owner: "main" | "subagent";
  isPersistent: boolean;
  startedAt: number;
  status: "starting" | "running" | "stopping" | "stopped";
}

export interface VllmManagerConfig {
  basePort: number;
  defaultGpuMemoryUtilization: number;
  defaultMaxModelLen: number;
  defaultTensorParallelSize: number;
  vllmCommand: string;
  healthCheckTimeout: number;
  shutdownTimeout: number;
}

const DEFAULT_CONFIG: VllmManagerConfig = {
  basePort: 8000,
  defaultGpuMemoryUtilization: 0.9,
  defaultMaxModelLen: 32768,
  defaultTensorParallelSize: 1,
  vllmCommand: "vllm",
  healthCheckTimeout: 120000,
  shutdownTimeout: 30000,
};

const SSH_CONNECTION_TIMEOUT_MS = 30000;
const SSH_COMMAND_TIMEOUT_MS = 60000;
const REMOTE_PROCESS_CHECK_INTERVAL_MS = 5000;

class VllmModelManager {
  private processes = new Map<string, VllmProcessEntry>();
  private config: VllmManagerConfig;
  private portCounter = 0;
  private lockIds = new Set<string>();

  constructor(config: Partial<VllmManagerConfig> = {}) {
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

  private resolveServerConfig(modelConfig: VllmModelConfig): {
    type: VllmServerType;
    host: string;
    port: number;
    ssh?: VllmServerConfig["ssh"];
    docker?: VllmServerConfig["docker"];
  } {
    const serverConfig = modelConfig.server;
    const deploymentType = modelConfig.deploymentType;
    
    let type: VllmServerType;
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

  private buildVllmArgs(port: number, modelConfig: VllmModelConfig): string[] {
    const args = [
      "serve",
      modelConfig.modelPath,
      "--host",
      "0.0.0.0",
      "--port",
      String(port),
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

  private async startLocalVllm(port: number, modelConfig: VllmModelConfig, processEntry: VllmProcessEntry): Promise<void> {
    const args = this.buildVllmArgs(port, modelConfig);
    const modelPath = modelConfig.modelPath;
    const isHfModel = !existsSync(modelPath);

    processEntry.process = spawn(
      this.config.vllmCommand,
      isHfModel ? [args[0], modelPath, ...args.slice(1)] : args,
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
          console.log(`[vLLM] Server started on port ${port}`);
        }
      });
    }

    if (processEntry.process.stderr) {
      processEntry.process.stderr.on("data", (data: Buffer) => {
        console.error(`[vLLM] stderr: ${data.toString()}`);
      });
    }

    processEntry.pid = processEntry.process.pid;
  }

  private async startRemoteVllm(
    host: string,
    port: number,
    modelConfig: VllmModelConfig,
    sshConfig: VllmServerConfig["ssh"],
    processEntry: VllmProcessEntry,
  ): Promise<void> {
    const args = this.buildVllmArgs(port, modelConfig);
    const vllmCommand = sshConfig?.vllmPath 
      ? `${sshConfig.vllmPath}/venv/bin/vllm` 
      : "vllm";
    const argsStr = args.join(" ");

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=accept-new",
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `nohup ${vllmCommand} ${argsStr} > /tmp/vllm-${processEntry.id}.log 2>&1 & echo $!`,
    ];

    console.log(`[vLLM] Starting remote vLLM on ${sshUser}@${sshHost}:${port}`);

    const pidProcess = spawn("ssh", sshArgs, { stdio: ["ignore", "pipe", "pipe"] });

    let pidOutput = "";
    let stderrOutput = "";
    
    if (pidProcess.stdout) {
      pidProcess.stdout.on("data", (data: Buffer) => {
        pidOutput += data.toString();
      });
    }

    if (pidProcess.stderr) {
      pidProcess.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pidProcess.kill();
        reject(new Error(`SSH connection timeout after ${SSH_CONNECTION_TIMEOUT_MS}ms`));
      }, SSH_CONNECTION_TIMEOUT_MS);

      pidProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const pid = pidOutput.trim();
          const parsedPid = parseInt(pid, 10);
          if (isNaN(parsedPid) || parsedPid <= 0) {
            reject(new Error(`Invalid PID received: ${pid}`));
            return;
          }
          processEntry.remotePid = parsedPid;
          console.log(`[vLLM] Remote vLLM started with PID ${parsedPid}`);
          resolve();
        } else {
          const errorMsg = stderrOutput.trim() || `SSH command failed with code ${code}`;
          reject(new Error(errorMsg));
        }
      });
      pidProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH process error: ${err.message}`));
      });
    });
  }

  private async checkRemoteProcess(
    host: string,
    sshConfig: VllmServerConfig["ssh"],
    pid: number,
  ): Promise<boolean> {
    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      "-o", "ConnectTimeout=5",
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `ps -p ${pid} > /dev/null 2>&1 && echo "running" || echo "stopped"`,
    ];

    return new Promise((resolve) => {
      const checkProcess = spawn("ssh", sshArgs, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";

      if (checkProcess.stdout) {
        checkProcess.stdout.on("data", (data: Buffer) => {
          output += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, SSH_CONNECTION_TIMEOUT_MS);

      checkProcess.on("close", () => {
        clearTimeout(timeout);
        resolve(output.trim() === "running");
      });
      checkProcess.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async stopRemoteVllm(
    host: string,
    sshConfig: VllmServerConfig["ssh"],
    processEntry: VllmProcessEntry,
  ): Promise<void> {
    if (!processEntry.remotePid) {
      console.warn(`[vLLM] No remote PID for ${processEntry.id}`);
      return;
    }

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      "-o", "ConnectTimeout=10",
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `kill ${processEntry.remotePid} 2>/dev/null || true`,
    ];

    console.log(`[vLLM] Stopping remote vLLM (PID: ${processEntry.remotePid})`);

    await new Promise<void>((resolve) => {
      const killProcess = spawn("ssh", sshArgs, { stdio: "ignore" });
      
      const timeout = setTimeout(() => {
        killProcess.kill();
        console.warn(`[vLLM] Timeout while stopping remote process ${processEntry.remotePid}`);
        resolve();
      }, SSH_COMMAND_TIMEOUT_MS);

      killProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(`[vLLM] Remote vLLM stopped (PID: ${processEntry.remotePid})`);
        } else {
          console.warn(`[vLLM] Remote kill command exited with code ${code}`);
        }
        resolve();
      });
      killProcess.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`[vLLM] Failed to stop remote process: ${err.message}`);
        resolve();
      });
    });
    
    await this.sleep(1000);
  }

  private buildDockerArgs(port: number, modelConfig: VllmModelConfig): string[] {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = [
      "run",
      "--rm",
      "-d",
      "--name", dockerConfig.containerName || `vllm-${modelConfig.id}-${port}`,
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

    args.push("-e", `VLLM_HOST_IP=0.0.0.0`);
    args.push("-e", `VLLM_PORT=${port}`);

    if (modelConfig.gpuMemoryUtilization) {
      args.push("-e", `VLLM_GPU_MEMORY_UTILIZATION=${modelConfig.gpuMemoryUtilization}`);
    }
    if (modelConfig.maxModelLen) {
      args.push("-e", `VLLM_MAX_MODEL_LEN=${modelConfig.maxModelLen}`);
    }

    if (dockerConfig.extraArgs) {
      args.push(...dockerConfig.extraArgs.split(" ").filter(Boolean));
    }

    args.push(dockerConfig.image);
    args.push("vllm", "serve", modelConfig.modelPath, "--host", "0.0.0.0", "--port", String(port));

    if (modelConfig.tensorParallelSize && modelConfig.tensorParallelSize > 1) {
      args.push("--tensor-parallel-size", String(modelConfig.tensorParallelSize));
    }

    return args;
  }

  private async startLocalDocker(
    port: number,
    modelConfig: VllmModelConfig,
    processEntry: VllmProcessEntry,
  ): Promise<void> {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = this.buildDockerArgs(port, modelConfig);
    const containerName = dockerConfig.containerName || `vllm-${modelConfig.id}-${port}`;

    console.log(`[vLLM] Starting local Docker vLLM: docker ${args.join(" ")}`);

    processEntry.process = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (processEntry.process.stdout) {
      processEntry.process.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`[vLLM] Docker stdout: ${output}`);
      });
    }

    if (processEntry.process.stderr) {
      processEntry.process.stderr.on("data", (data: Buffer) => {
        console.error(`[vLLM] Docker stderr: ${data.toString()}`);
      });
    }

    processEntry.pid = processEntry.process.pid;
    processEntry.containerId = containerName;
  }

  private async startRemoteDocker(
    host: string,
    port: number,
    modelConfig: VllmModelConfig,
    sshConfig: VllmServerConfig["ssh"],
    processEntry: VllmProcessEntry,
  ): Promise<void> {
    const dockerConfig = modelConfig.server?.docker;
    if (!dockerConfig) {
      throw new Error("Docker configuration is required for Docker deployment");
    }

    const args = this.buildDockerArgs(port, modelConfig);
    const containerName = dockerConfig.containerName || `vllm-${modelConfig.id}-${port}`;
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

    console.log(`[vLLM] Starting remote Docker vLLM on ${sshUser}@${sshHost}:${port}`);

    const containerProcess = spawn("ssh", sshArgs, { stdio: ["ignore", "pipe", "pipe"] });

    let containerId = "";

    if (containerProcess.stdout) {
      containerProcess.stdout.on("data", (data: Buffer) => {
        containerId += data.toString();
      });
    }

    if (containerProcess.stderr) {
      containerProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[vLLM] SSH Docker stderr: ${data.toString()}`);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        containerProcess.kill();
        reject(new Error(`Docker start timeout after ${SSH_CONNECTION_TIMEOUT_MS}ms`));
      }, SSH_CONNECTION_TIMEOUT_MS);

      containerProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          processEntry.containerId = containerId.trim().substring(0, 12);
          console.log(`[vLLM] Remote Docker vLLM started with container ${processEntry.containerId}`);
          resolve();
        } else {
          reject(new Error(`Docker start failed with code ${code}`));
        }
      });
      containerProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH process error: ${err.message}`));
      });
    });
  }

  private async stopLocalDocker(processEntry: VllmProcessEntry): Promise<void> {
    if (!processEntry.containerId) {
      console.warn(`[vLLM] No container ID for ${processEntry.id}`);
      return;
    }

    console.log(`[vLLM] Stopping local Docker container ${processEntry.containerId}`);

    await new Promise<void>((resolve) => {
      const stopProcess = spawn("docker", ["stop", processEntry.containerId!], {
        stdio: "ignore",
      });

      const timeout = setTimeout(() => {
        stopProcess.kill();
        console.warn(`[vLLM] Timeout while stopping container ${processEntry.containerId}`);
        resolve();
      }, this.config.shutdownTimeout);

      stopProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(`[vLLM] Docker container ${processEntry.containerId} stopped`);
        } else {
          console.warn(`[vLLM] Docker stop command exited with code ${code}`);
        }
        resolve();
      });
      stopProcess.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`[vLLM] Failed to stop Docker container: ${err.message}`);
        resolve();
      });
    });

    await this.sleep(1000);
  }

  private async stopRemoteDocker(
    host: string,
    sshConfig: VllmServerConfig["ssh"],
    processEntry: VllmProcessEntry,
  ): Promise<void> {
    if (!processEntry.containerId) {
      console.warn(`[vLLM] No container ID for ${processEntry.id}`);
      return;
    }

    const sshHost = sshConfig?.host ?? host;
    const sshUser = sshConfig?.username ?? "root";
    const sshPort = sshConfig?.port ?? 22;

    const sshArgs = [
      "-p", String(sshPort),
      "-o", "ConnectTimeout=10",
      ...(sshConfig?.privateKeyPath ? ["-i", sshConfig.privateKeyPath] : []),
      `${sshUser}@${sshHost}`,
      `docker stop ${processEntry.containerId}`,
    ];

    console.log(`[vLLM] Stopping remote Docker container ${processEntry.containerId}`);

    await new Promise<void>((resolve) => {
      const stopProcess = spawn("ssh", sshArgs, { stdio: "ignore" });

      const timeout = setTimeout(() => {
        stopProcess.kill();
        console.warn(`[vLLM] Timeout while stopping remote container ${processEntry.containerId}`);
        resolve();
      }, SSH_COMMAND_TIMEOUT_MS);

      stopProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(`[vLLM] Remote Docker container ${processEntry.containerId} stopped`);
        } else {
          console.warn(`[vLLM] Remote docker stop exited with code ${code}`);
        }
        resolve();
      });
      stopProcess.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`[vLLM] Failed to stop remote container: ${err.message}`);
        resolve();
      });
    });

    await this.sleep(1000);
  }

  async startMainAgentVllm(modelConfig: VllmModelConfig): Promise<VllmProcessEntry> {
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

      const processEntry: VllmProcessEntry = {
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

      console.log(`[vLLM] Starting main agent vLLM with model ${modelId} on ${host}:${port} (persistent)`);

      if (type === "docker") {
        if (ssh) {
          await this.startRemoteDocker(host, port, modelConfig, ssh, processEntry);
        } else {
          await this.startLocalDocker(port, modelConfig, processEntry);
        }
      } else if (type === "local") {
        await this.startLocalVllm(port, modelConfig, processEntry);
      } else {
        await this.startRemoteVllm(host, port, modelConfig, ssh, processEntry);
      }

      const healthOk = await this.checkHealth(baseUrl, this.config.healthCheckTimeout);
      if (!healthOk) {
        processEntry.status = "stopped";
        throw new Error(`vLLM health check failed for main agent`);
      }

      processEntry.status = "running";
      this.processes.set(entryId, processEntry);
      return processEntry;
    } finally {
      this.lockIds.delete(entryId);
    }
  }

  async startSubagentVllm(params: {
    subagentRunId: string;
    subagentLabel: string;
    modelConfig: VllmModelConfig;
  }): Promise<VllmProcessEntry> {
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
      const { type, host, port, ssh } = serverConfig;

      const baseUrl = `http://${host}:${port}/v1`;

      const processEntry: VllmProcessEntry = {
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

      console.log(`[vLLM] Starting subagent ${subagentRunId} with model ${modelConfig.id} on ${host}:${port}`);

      if (type === "docker") {
        if (ssh) {
          await this.startRemoteDocker(host, port, modelConfig, ssh, processEntry);
        } else {
          await this.startLocalDocker(port, modelConfig, processEntry);
        }
      } else if (type === "local") {
        await this.startLocalVllm(port, modelConfig, processEntry);
      } else {
        await this.startRemoteVllm(host, port, modelConfig, ssh, processEntry);
      }

      const healthOk = await this.checkHealth(baseUrl, this.config.healthCheckTimeout);
      if (!healthOk) {
        processEntry.status = "stopped";
        this.processes.delete(entryId);
        throw new Error(`vLLM health check failed for subagent ${subagentRunId}`);
      }

      processEntry.status = "running";
      this.processes.set(entryId, processEntry);
      return processEntry;
    } finally {
      this.lockIds.delete(entryId);
    }
  }

  async stopSubagentVllm(subagentRunId: string): Promise<boolean> {
    const entryId = `subagent:${subagentRunId}`;
    const processEntry = this.processes.get(entryId);
    
    if (!processEntry) {
      return true;
    }

    if (processEntry.status === "stopping" || processEntry.status === "stopped") {
      return true;
    }

    if (processEntry.isPersistent) {
      console.log(`[vLLM] Skipping stop for persistent subagent ${subagentRunId}`);
      return false;
    }

    processEntry.status = "stopping";

    if (processEntry.serverType === "docker") {
      const ssh = processEntry.modelConfig.server?.ssh;
      if (ssh) {
        await this.stopRemoteDocker(processEntry.modelConfig.baseUrl, ssh, processEntry);
      } else {
        await this.stopLocalDocker(processEntry);
      }
    } else if (processEntry.serverType === "local") {
      await this.stopLocalVllm(processEntry);
    } else {
      const ssh = processEntry.modelConfig.server?.ssh;
      await this.stopRemoteVllm(processEntry.modelConfig.baseUrl, ssh, processEntry);
    }

    processEntry.status = "stopped";
    this.processes.delete(entryId);
    console.log(`[vLLM] Stopped subagent ${subagentRunId} vLLM process`);
    return true;
  }

  async stopAllSubagentVllm(): Promise<void> {
    const subagentEntries = Array.from(this.processes.values())
      .filter(p => p.owner === "subagent" && !p.isPersistent);
    
    const stopPromises = subagentEntries.map(p => {
      const runId = p.subagentRunId;
      if (runId) {
        return this.stopSubagentVllm(runId);
      }
      return Promise.resolve();
    });
    
    await Promise.all(stopPromises);
  }

  async stopAll(force: boolean = false): Promise<void> {
    const allEntries = Array.from(this.processes.values());
    
    for (const entry of allEntries) {
      if (entry.owner === "main" && !force) {
        console.log(`[vLLM] Skipping stop for main agent vLLM (use force=true to override)`);
        continue;
      }
      
      if (entry.owner === "subagent") {
        const runId = entry.subagentRunId;
        if (runId) {
          await this.stopSubagentVllm(runId);
        }
      } else if (entry.status === "running") {
        await this.stopEntry(entry);
      }
    }
  }

  private async stopEntry(processEntry: VllmProcessEntry): Promise<void> {
    if (processEntry.status === "stopping" || processEntry.status === "stopped") {
      return;
    }

    processEntry.status = "stopping";

    if (processEntry.serverType === "docker") {
      const ssh = processEntry.modelConfig.server?.ssh;
      if (ssh) {
        await this.stopRemoteDocker(processEntry.modelConfig.baseUrl, ssh, processEntry);
      } else {
        await this.stopLocalDocker(processEntry);
      }
    } else if (processEntry.serverType === "local") {
      await this.stopLocalVllm(processEntry);
    } else {
      const ssh = processEntry.modelConfig.server?.ssh;
      await this.stopRemoteVllm(processEntry.modelConfig.baseUrl, ssh, processEntry);
    }

    processEntry.status = "stopped";
    this.processes.delete(processEntry.id);
  }

  private async stopLocalVllm(processEntry: VllmProcessEntry): Promise<void> {
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
      console.error(`[vLLM] Error stopping process for ${processEntry.id}:`, err);
    }
  }

  getProcess(id: string): VllmProcessEntry | undefined {
    return this.processes.get(id);
  }

  getSubagentProcess(subagentRunId: string): VllmProcessEntry | undefined {
    return this.processes.get(`subagent:${subagentRunId}`);
  }

  getMainAgentProcess(modelId: string): VllmProcessEntry | undefined {
    return this.processes.get(`main:${modelId}`);
  }

  getAllProcesses(): VllmProcessEntry[] {
    return Array.from(this.processes.values());
  }

  getSubagentProcesses(): VllmProcessEntry[] {
    return Array.from(this.processes.values()).filter(p => p.owner === "subagent");
  }

  getMainAgentProcesses(): VllmProcessEntry[] {
    return Array.from(this.processes.values()).filter(p => p.owner === "main");
  }

  isProcessRunning(id: string): boolean {
    const entry = this.processes.get(id);
    return entry?.status === "running";
  }

  isSubagentVllmRunning(subagentRunId: string): boolean {
    return this.isProcessRunning(`subagent:${subagentRunId}`);
  }

  isMainAgentVllmRunning(modelId: string): boolean {
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

let globalManager: VllmModelManager | null = null;

export function getVllmModelManager(config?: Partial<VllmManagerConfig>): VllmModelManager {
  if (!globalManager) {
    globalManager = new VllmModelManager(config);
  }
  return globalManager;
}

export function resetVllmModelManager(): void {
  globalManager = null;
}
