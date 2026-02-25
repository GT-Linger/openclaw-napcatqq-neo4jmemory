import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import {
  loadVllmModelsConfig,
  saveVllmModelsConfig,
  loadSubagentVllmBindings,
  saveSubagentVllmBindings,
  listAvailableVllmModels,
} from "../../agents/subagent-vllm-integration.js";
import type { VllmModelListEntry, VllmServerConfig } from "../../agents/subagent-vllm-config.js";
import { logWarning, silent } from "../../logger.js";
import { getOpenClawConfig } from "../config-cli.js";
import { input, confirm, select } from "../prompts.js";

export async function subagentVllmList(): Promise<void> {
  const models = await loadVllmModelsConfig();

  if (models.length === 0) {
    console.log("No vLLM models configured.");
    console.log("Run 'openclaw subagent-vllm add' to add a model.");
    return;
  }

  console.log("\nAvailable vLLM Models:");
  console.log("─".repeat(60));
  for (const model of models) {
    console.log(`  ${model.id}`);
    console.log(`    Name: ${model.name}`);
    
    if (model.server) {
      if (model.server.type === "remote") {
        console.log(`    Server: Remote (${model.server.host}:${model.server.port})`);
        if (model.server.ssh?.enabled) {
          console.log(`    SSH: ${model.server.ssh.username}@${model.server.ssh.host}:${model.server.ssh.port}`);
        }
      } else {
        console.log(`    Server: Local`);
      }
    } else {
      console.log(`    Server: Local (default)`);
    }
    
    if (model.description) {
      console.log(`    Description: ${model.description}`);
    }
    if (model.capabilities?.length) {
      console.log(`    Capabilities: ${model.capabilities.join(", ")}`);
    }
    if (model.gpuMemoryUtilization) {
      console.log(`    GPU Memory: ${(model.gpuMemoryUtilization * 100).toFixed(0)}%`);
    }
    if (model.maxModelLen) {
      console.log(`    Max Context: ${model.maxModelLen}`);
    }
    console.log();
  }

  const bindings = await loadSubagentVllmBindings();
  if (Object.keys(bindings).length > 0) {
    console.log("\nSubagent Bindings:");
    console.log("─".repeat(60));
    for (const [label, config] of Object.entries(bindings)) {
      console.log(`  ${label} -> ${config.vllmModelId}`);
      console.log(`    autoLoad: ${config.autoLoad ?? true}`);
      console.log(`    autoUnload: ${config.autoUnload ?? true}`);
      if (config.server) {
        console.log(`    Server override: ${config.server.type}${config.server.host ? ` (${config.server.host})` : ""}`);
      }
      console.log();
    }
  }
}

export async function subagentVllmAdd(): Promise<void> {
  console.log("Add a new vLLM model configuration\n");

  const id = await input({
    message: "Model ID (unique identifier):",
    validate: (value) => (value.trim() ? undefined : "Required"),
  });

  const name = await input({
    message: "Model display name:",
    validate: (value) => (value.trim() ? undefined : "Required"),
  });

  const modelPath = await input({
    message: "Model path (local path or HuggingFace model ID):",
    validate: (value) => (value.trim() ? undefined : "Required"),
  });

  const serverType = await select({
    message: "Server type:",
    options: [
      { value: "local", label: "Local", hint: "Run vLLM on this machine" },
      { value: "remote", label: "Remote (SSH)", hint: "Run vLLM on a remote server via SSH" },
    ],
  });

  let server: VllmServerConfig | undefined;
  let baseUrl = "http://127.0.0.1:8000/v1";

  if (serverType === "remote") {
    const remoteHost = await input({
      message: "Remote server hostname/IP:",
      validate: (value) => (value.trim() ? undefined : "Required"),
    });

    const remotePort = await input({
      message: "vLLM port on remote server:",
      initialValue: "8000",
    });

    baseUrl = `http://${remoteHost.trim()}:${remotePort.trim()}/v1`;

    const useSsh = await confirm({
      message: "Use SSH to start/stop vLLM on remote server?",
      initialValue: true,
    });

    if (useSsh) {
      const sshHost = await input({
        message: "SSH hostname (press Enter to use same as remote host):",
        initialValue: remoteHost.trim(),
      });

      const sshPort = await input({
        message: "SSH port:",
        initialValue: "22",
      });

      const sshUsername = await input({
        message: "SSH username:",
        initialValue: "root",
      });

      const authMethod = await select({
        message: "SSH authentication method:",
        options: [
          { value: "key", label: "Private key file", hint: "Use SSH private key" },
          { value: "password", label: "Password", hint: "Use password (less secure)" },
        ],
      });

      let privateKeyPath: string | undefined;
      let password: string | undefined;

      if (authMethod === "key") {
        privateKeyPath = await input({
          message: "Path to SSH private key:",
          initialValue: `${process.env.HOME || ""}/.ssh/id_rsa`,
        });
      } else {
        password = await input({
          message: "SSH password:",
        });
      }

      const vllmPath = await input({
        message: "vLLM installation path on remote server (optional):",
        placeholder: "/opt/vllm",
      });

      server = {
        type: "remote",
        host: remoteHost.trim(),
        port: parseInt(remotePort, 10) || 8000,
        ssh: {
          enabled: true,
          host: sshHost.trim() || remoteHost.trim(),
          port: parseInt(sshPort, 10) || 22,
          username: sshUsername.trim(),
          privateKeyPath: privateKeyPath?.trim(),
          password: password?.trim(),
          vllmPath: vllmPath.trim() || undefined,
        },
      };
    } else {
      server = {
        type: "remote",
        host: remoteHost.trim(),
        port: parseInt(remotePort, 10) || 8000,
      };
    }
  } else {
    baseUrl = await input({
      message: "vLLM base URL:",
      initialValue: "http://127.0.0.1:8000/v1",
    });
  }

  const apiKey = await input({
    message: "API key (optional, press Enter to skip):",
  });

  const description = await input({
    message: "Description (optional):",
  });

  const capabilitiesInput = await input({
    message: "Capabilities (comma-separated, e.g. coding,reasoning,math):",
  });

  const capabilities = capabilitiesInput
    ? capabilitiesInput.split(",").map((c) => c.trim()).filter(Boolean)
    : undefined;

  const gpuMemoryUtilizationInput = await input({
    message: "GPU memory utilization (0.0-1.0, press Enter for default 0.9):",
    initialValue: "0.9",
  });
  const gpuMemoryUtilization = parseFloat(gpuMemoryUtilizationInput) || 0.9;

  const maxModelLenInput = await input({
    message: "Max model context length (press Enter for default 32768):",
    initialValue: "32768",
  });
  const maxModelLen = parseInt(maxModelLenInput, 10) || 32768;

  const models = await loadVllmModelsConfig();

  const newModel: VllmModelListEntry = {
    id: id.trim(),
    name: name.trim(),
    modelPath: modelPath.trim(),
    server,
    apiKey: apiKey.trim() || undefined,
    description: description.trim() || undefined,
    capabilities,
    gpuMemoryUtilization,
    maxModelLen,
  };

  const existingIndex = models.findIndex((m) => m.id === newModel.id);
  if (existingIndex >= 0) {
    const replace = await confirm({
      message: `Model "${id}" already exists. Replace?`,
      initialValue: false,
    });
    if (!replace) {
      console.log("Cancelled.");
      return;
    }
    models[existingIndex] = newModel;
  } else {
    models.push(newModel);
  }

  await saveVllmModelsConfig(models);
  console.log(`\nModel "${name}" added successfully.`);
  if (server?.type === "remote") {
    console.log(`  Server: Remote (${server.host}:${server.port})`);
    if (server.ssh?.enabled) {
      console.log(`  SSH: ${server.ssh.username}@${server.ssh.host}:${server.ssh.port}`);
    }
  } else {
    console.log(`  Server: Local (${baseUrl})`);
  }
}

export async function subagentVllmRemove(): Promise<void> {
  const models = await loadVllmModelsConfig();

  if (models.length === 0) {
    console.log("No vLLM models configured.");
    return;
  }

  const choices = models.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }));

  const toRemove = await select({
    message: "Select model to remove:",
    options: choices,
  });

  const confirmRemove = await confirm({
    message: `Remove model "${toRemove}"?`,
    initialValue: false,
  });

  if (!confirmRemove) {
    console.log("Cancelled.");
    return;
  }

  const filtered = models.filter((m) => m.id !== toRemove);
  await saveVllmModelsConfig(filtered);
  console.log(`Model "${toRemove}" removed.`);
}

export async function subagentVllmBind(): Promise<void> {
  console.log("Bind a subagent label to a vLLM model\n");

  const subagentLabel = await input({
    message: "Subagent label (e.g. coding-agent, reasoning-agent):",
    validate: (value) => (value.trim() ? undefined : "Required"),
  });

  const models = await loadVllmModelsConfig();
  if (models.length === 0) {
    console.log("No vLLM models available. Run 'openclaw subagent-vllm add' first.");
    return;
  }

  const modelChoices = models.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }));

  const modelId = await select({
    message: "Select vLLM model:",
    options: modelChoices,
  });

  const autoLoad = await confirm({
    message: "Auto-load model when subagent starts?",
    initialValue: true,
  });

  const autoUnload = await confirm({
    message: "Auto-unload model when subagent completes?",
    initialValue: true,
  });

  let unloadDelayMs = 0;
  if (autoUnload) {
    const delayInput = await input({
      message: "Unload delay in milliseconds (0 = immediate):",
      initialValue: "5000",
    });
    unloadDelayMs = parseInt(delayInput, 10) || 5000;
  }

  const bindings = await loadSubagentVllmBindings();
  bindings[subagentLabel.trim()] = {
    vllmModelId: modelId,
    autoLoad,
    autoUnload,
    unloadDelayMs,
  };

  await saveSubagentVllmBindings(bindings);
  console.log(`\nBound subagent "${subagentLabel}" to model "${modelId}".`);
}

export async function subagentVllmUnbind(): Promise<void> {
  const bindings = await loadSubagentVllmBindings();

  if (Object.keys(bindings).length === 0) {
    console.log("No subagent vLLM bindings found.");
    return;
  }

  const choices = Object.entries(bindings).map(([label, config]) => ({
    value: label,
    label: `${label} -> ${config.vllmModelId}`,
  }));

  const toUnbind = await select({
    message: "Select binding to remove:",
    options: choices,
  });

  const confirmUnbind = await confirm({
    message: `Remove binding for "${toUnbind}"?`,
    initialValue: false,
  });

  if (!confirmUnbind) {
    console.log("Cancelled.");
    return;
  }

  delete bindings[toUnbind];
  await saveSubagentVllmBindings(bindings);
  console.log(`Binding for "${toUnbind}" removed.`);
}
