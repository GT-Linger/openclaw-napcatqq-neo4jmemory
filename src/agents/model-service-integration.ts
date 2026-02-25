import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import {
  VLLM_MODELS_CONFIG_FILENAME,
  SUBAGENT_VLLM_CONFIG_FILENAME,
  type VllmModelListEntry,
  type VllmSubagentConfig,
} from "./subagent-vllm-config.js";
import {
  getVllmModelManager,
  type VllmModelConfig,
} from "./vllm-manager.js";
import {
  getSglangModelManager,
  type SglangModelConfig,
} from "./sglang-manager.js";
import type { SubagentConfig, ModelProvider } from "./subagent-config.js";

const PROVIDERS_REQUIRING_PROCESS = ["vllm", "sglang"] as const;
type ProcessProvider = typeof PROVIDERS_REQUIRING_PROCESS[number];

function isProcessProvider(provider: ModelProvider): provider is ProcessProvider {
  return PROVIDERS_REQUIRING_PROCESS.includes(provider as ProcessProvider);
}

export async function loadVllmModelsConfig(agentDir?: string): Promise<VllmModelListEntry[]> {
  const configDir = agentDir ?? resolveOpenClawAgentDir();
  const configPath = join(configDir, VLLM_MODELS_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[ModelService] Error loading models config:", err);
    return [];
  }
}

export async function saveVllmModelsConfig(
  models: VllmModelListEntry[],
  agentDir?: string,
): Promise<void> {
  const configDir = agentDir ?? resolveOpenClawAgentDir();
  const configPath = join(configDir, VLLM_MODELS_CONFIG_FILENAME);
  await writeFile(configPath, JSON.stringify(models, null, 2), "utf-8");
}

export async function loadSubagentVllmBindings(agentDir?: string): Promise<Record<string, VllmSubagentConfig>> {
  const configDir = agentDir ?? resolveOpenClawAgentDir();
  const configPath = join(configDir, SUBAGENT_VLLM_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[ModelService] Error loading subagent bindings:", err);
    return {};
  }
}

export async function saveSubagentVllmBindings(
  bindings: Record<string, VllmSubagentConfig>,
  agentDir?: string,
): Promise<void> {
  const configDir = agentDir ?? resolveOpenClawAgentDir();
  const configPath = join(configDir, SUBAGENT_VLLM_CONFIG_FILENAME);
  await writeFile(configPath, JSON.stringify(bindings, null, 2), "utf-8");
}

export async function getSubagentVllmBinding(
  subagentLabel: string,
  agentDir?: string,
): Promise<VllmSubagentConfig | null> {
  const bindings = await loadSubagentVllmBindings(agentDir);
  return bindings[subagentLabel] ?? null;
}

export async function listAvailableVllmModels(
  agentDir?: string,
): Promise<Array<{ id: string; name: string; description?: string; capabilities?: string[] }>> {
  const models = await loadVllmModelsConfig(agentDir);
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    capabilities: m.capabilities,
  }));
}

export async function checkServiceAvailable(baseUrl: string, timeout: number = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const url = baseUrl.replace("/v1", "") + "/models";
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function startSubagentModelService(
  subagentRunId: string,
  subagent: SubagentConfig,
  agentDir?: string,
): Promise<string | null> {
  const provider = subagent.model.endpoint.provider;
  const behavior = subagent.behavior ?? {};

  if (!isProcessProvider(provider)) {
    console.log(`[ModelService] Provider "${provider}" does not require process management, using direct endpoint`);
    if (behavior.autoLoad === false) {
      console.log(`[ModelService] autoLoad=false for subagent "${subagent.id}", skipping service start`);
      return null;
    }
    return subagent.model.endpoint.baseUrl;
  }

  if (behavior.autoLoad === false) {
    console.log(`[ModelService] autoLoad=false for subagent "${subagent.id}", skipping service start`);
    return null;
  }

  if (provider === "vllm") {
    return startSubagentVllm(subagentRunId, subagent.id, agentDir);
  }

  if (provider === "sglang") {
    return startSubagentSglang(subagentRunId, subagent.id, agentDir);
  }

  console.error(`[ModelService] Unsupported provider: ${provider}`);
  return null;
}

export async function stopSubagentModelService(
  subagentRunId: string,
  subagent: SubagentConfig,
  agentDir?: string,
): Promise<void> {
  const provider = subagent.model.endpoint.provider;
  const behavior = subagent.behavior ?? {};

  if (!isProcessProvider(provider)) {
    console.log(`[ModelService] Provider "${provider}" does not require process management, no action needed`);
    return;
  }

  if (behavior.autoUnload === false) {
    console.log(`[ModelService] autoUnload=false for subagent "${subagent.id}", keeping service running`);
    return;
  }

  if (provider === "vllm") {
    return stopSubagentVllm(subagentRunId, subagent.id, behavior.unloadDelayMs);
  }

  if (provider === "sglang") {
    return stopSubagentSglang(subagentRunId, subagent.id, behavior.unloadDelayMs);
  }
}

export async function getSubagentModelServiceBaseUrl(
  subagentRunId: string,
  subagent: SubagentConfig,
): Promise<string | null> {
  const provider = subagent.model.endpoint.provider;

  if (!isProcessProvider(provider)) {
    return subagent.model.endpoint.baseUrl;
  }

  if (provider === "vllm") {
    return getSubagentVllmBaseUrl(subagentRunId);
  }

  if (provider === "sglang") {
    return getSubagentSglangBaseUrl(subagentRunId);
  }

  return null;
}

export async function isSubagentModelServiceRunning(
  subagentRunId: string,
  subagent: SubagentConfig,
): Promise<boolean> {
  const provider = subagent.model.endpoint.provider;

  if (!isProcessProvider(provider)) {
    return checkServiceAvailable(subagent.model.endpoint.baseUrl);
  }

  if (provider === "vllm") {
    return isSubagentVllmRunning(subagentRunId);
  }

  if (provider === "sglang") {
    return isSubagentSglangRunning(subagentRunId);
  }

  return false;
}

async function startSubagentVllm(
  subagentRunId: string,
  subagentLabel: string,
  agentDir?: string,
): Promise<string | null> {
  const binding = await getSubagentVllmBinding(subagentLabel, agentDir);
  if (!binding) {
    console.log(`[ModelService] No vLLM binding found for subagent "${subagentLabel}"`);
    return null;
  }

  const models = await loadVllmModelsConfig(agentDir);
  const modelEntry = models.find((m) => m.id === binding.vllmModelId);

  if (!modelEntry) {
    console.error(`[ModelService] Model "${binding.vllmModelId}" not found in vllm-models.json`);
    return null;
  }

  const modelConfig: VllmModelConfig = {
    id: modelEntry.id,
    name: modelEntry.name,
    modelPath: modelEntry.modelPath,
    baseUrl: modelEntry.baseUrl,
    apiKey: modelEntry.apiKey,
    gpuMemoryUtilization: modelEntry.gpuMemoryUtilization,
    maxModelLen: modelEntry.maxModelLen,
    tensorParallelSize: modelEntry.tensorParallelSize,
    port: modelEntry.port,
  };

  const manager = getVllmModelManager();

  try {
    const processEntry = await manager.startSubagentVllm({
      subagentRunId,
      subagentLabel,
      modelConfig,
    });

    console.log(`[ModelService] Started vLLM for subagent ${subagentRunId} (${subagentLabel}) at ${processEntry.baseUrl}`);
    return processEntry.baseUrl;
  } catch (err) {
    console.error(`[ModelService] Failed to start vLLM for subagent ${subagentRunId}:`, err);
    return null;
  }
}

async function stopSubagentVllm(
  subagentRunId: string,
  subagentLabel: string,
  unloadDelayMs?: number,
): Promise<void> {
  const manager = getVllmModelManager();

  if (!manager.isSubagentVllmRunning(subagentRunId)) {
    console.log(`[ModelService] No running vLLM process for subagent ${subagentRunId}`);
    return;
  }

  try {
    if (unloadDelayMs && unloadDelayMs > 0) {
      console.log(`[ModelService] Scheduling vLLM shutdown for subagent ${subagentRunId} in ${unloadDelayMs}ms`);
      setTimeout(() => {
        manager.stopSubagentVllm(subagentRunId);
      }, unloadDelayMs);
    } else {
      await manager.stopSubagentVllm(subagentRunId);
      console.log(`[ModelService] Stopped vLLM for subagent ${subagentRunId}`);
    }
  } catch (err) {
    console.error(`[ModelService] Error stopping vLLM for subagent ${subagentRunId}:`, err);
  }
}

async function startSubagentSglang(
  subagentRunId: string,
  subagentLabel: string,
  agentDir?: string,
): Promise<string | null> {
  const binding = await getSubagentVllmBinding(subagentLabel, agentDir);
  if (!binding) {
    console.log(`[ModelService] No SGLang binding found for subagent "${subagentLabel}"`);
    return null;
  }

  const models = await loadVllmModelsConfig(agentDir);
  const modelEntry = models.find((m) => m.id === binding.vllmModelId);

  if (!modelEntry) {
    console.error(`[ModelService] Model "${binding.vllmModelId}" not found in models config`);
    return null;
  }

  const modelConfig: SglangModelConfig = {
    id: modelEntry.id,
    name: modelEntry.name,
    modelPath: modelEntry.modelPath,
    baseUrl: modelEntry.baseUrl,
    apiKey: modelEntry.apiKey,
    gpuMemoryUtilization: modelEntry.gpuMemoryUtilization,
    maxModelLen: modelEntry.maxModelLen,
    tensorParallelSize: modelEntry.tensorParallelSize,
    port: modelEntry.port,
  };

  const manager = getSglangModelManager();

  try {
    const processEntry = await manager.startSubagentSglang({
      subagentRunId,
      subagentLabel,
      modelConfig,
    });

    console.log(`[ModelService] Started SGLang for subagent ${subagentRunId} (${subagentLabel}) at ${processEntry.baseUrl}`);
    return processEntry.baseUrl;
  } catch (err) {
    console.error(`[ModelService] Failed to start SGLang for subagent ${subagentRunId}:`, err);
    return null;
  }
}

async function stopSubagentSglang(
  subagentRunId: string,
  subagentLabel: string,
  unloadDelayMs?: number,
): Promise<void> {
  const manager = getSglangModelManager();

  if (!manager.isSubagentSglangRunning(subagentRunId)) {
    console.log(`[ModelService] No running SGLang process for subagent ${subagentRunId}`);
    return;
  }

  try {
    if (unloadDelayMs && unloadDelayMs > 0) {
      console.log(`[ModelService] Scheduling SGLang shutdown for subagent ${subagentRunId} in ${unloadDelayMs}ms`);
      setTimeout(() => {
        manager.stopSubagentSglang(subagentRunId);
      }, unloadDelayMs);
    } else {
      await manager.stopSubagentSglang(subagentRunId);
      console.log(`[ModelService] Stopped SGLang for subagent ${subagentRunId}`);
    }
  } catch (err) {
    console.error(`[ModelService] Error stopping SGLang for subagent ${subagentRunId}:`, err);
  }
}

async function getSubagentVllmBaseUrl(subagentRunId: string): Promise<string | null> {
  const manager = getVllmModelManager();
  return manager.getSubagentBaseUrl(subagentRunId);
}

async function getSubagentSglangBaseUrl(subagentRunId: string): Promise<string | null> {
  const manager = getSglangModelManager();
  return manager.getSubagentBaseUrl(subagentRunId);
}

async function isSubagentVllmRunning(subagentRunId: string): Promise<boolean> {
  const manager = getVllmModelManager();
  return manager.isSubagentVllmRunning(subagentRunId);
}

async function isSubagentSglangRunning(subagentRunId: string): Promise<boolean> {
  const manager = getSglangModelManager();
  return manager.isSubagentSglangRunning(subagentRunId);
}

export async function getSubagentModelServiceStatus(
  subagentRunId: string,
  subagent: SubagentConfig,
): Promise<{ running: boolean; baseUrl?: string; modelId?: string }> {
  const provider = subagent.model.endpoint.provider;

  if (!isProcessProvider(provider)) {
    const available = await checkServiceAvailable(subagent.model.endpoint.baseUrl);
    return {
      running: available,
      baseUrl: subagent.model.endpoint.baseUrl,
      modelId: subagent.model.endpoint.model,
    };
  }

  if (provider === "vllm") {
    const manager = getVllmModelManager();
    const process = manager.getSubagentProcess(subagentRunId);
    if (!process) {
      return { running: false };
    }
    return {
      running: process.status === "running",
      baseUrl: process.baseUrl,
      modelId: process.modelId,
    };
  }

  if (provider === "sglang") {
    const manager = getSglangModelManager();
    const process = manager.getSubagentProcess(subagentRunId);
    if (!process) {
      return { running: false };
    }
    return {
      running: process.status === "running",
      baseUrl: process.baseUrl,
      modelId: process.modelId,
    };
  }

  return { running: false };
}
