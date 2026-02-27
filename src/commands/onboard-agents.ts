import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  getTemplateNames,
  getTemplateById,
  createSubagentFromTemplate,
} from "../agents/subagent-templates.js";
import { listSubagents, addSubagent } from "../agents/subagent-manager.js";
import { enhanceSubagentConfig, canEnhancePersonality } from "../agents/subagent-personality-enhancer.js";
import { createSubagentWorkspaceFromConfig } from "../agents/subagent-workspace.js";
import type { SubagentConfig, ModelEndpoint } from "../agents/subagent-config.js";
import type { VllmServerConfig } from "../agents/subagent-vllm-config.js";
import type { SglangServerConfig } from "../agents/sglang-manager.js";
import {
  loadVllmModelsConfig,
  saveVllmModelsConfig,
} from "../agents/model-service-integration.js";

export interface MainAgentEndpoint {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

async function checkEndpointAvailable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(baseUrl.replace("/v1", "") + "/models", {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export type MainAgentEndpointStatus = {
  available: boolean;
  endpoint: MainAgentEndpoint | undefined;
  reason?: string;
};

export async function checkMainAgentEndpoint(cfg: OpenClawConfig): Promise<MainAgentEndpointStatus> {
  const endpoint = getMainAgentEndpointFromConfig(cfg);
  if (!endpoint) {
    return {
      available: false,
      endpoint: undefined,
      reason: "未配置主智能体模型",
    };
  }

  const isAvailable = await checkEndpointAvailable(endpoint.baseUrl);
  if (!isAvailable) {
    return {
      available: false,
      endpoint,
      reason: "主智能体模型服务未运行",
    };
  }

  return {
    available: true,
    endpoint,
  };
}

function getMainAgentEndpointFromConfig(cfg: OpenClawConfig): MainAgentEndpoint | undefined {
  const modelConfig = cfg.agents?.defaults?.model;
  if (!modelConfig) {
    return undefined;
  }

  let primaryModel = "";
  if (typeof modelConfig === "string") {
    primaryModel = modelConfig;
  } else if (modelConfig.primary) {
    primaryModel = modelConfig.primary;
  }

  if (!primaryModel) {
    return undefined;
  }

  const [provider, model] = primaryModel.includes("/")
    ? primaryModel.split("/")
    : [undefined, primaryModel];

  let baseUrl = "https://api.openai.com/v1";
  if (provider === "anthropic") {
    baseUrl = "https://api.anthropic.com/v1";
  } else if (provider === "ollama") {
    baseUrl = "http://localhost:11434/v1";
  } else if (provider === "vllm") {
    baseUrl = "http://localhost:8000/v1";
  } else if (provider === "sglang") {
    baseUrl = "http://localhost:8000/v1";
  }

  return {
    baseUrl,
    model: model || primaryModel,
  };
}

async function promptModelProvider(prompter: WizardPrompter): Promise<string> {
  const choice = await prompter.select({
    message: "选择模型供应商",
    options: [
      { value: "vllm", label: "vLLM", hint: "高性能 LLM 推理服务" },
      { value: "ollama", label: "Ollama", hint: "本地 LLM 推理框架" },
      { value: "sglang", label: "SGLang", hint: "快速 LLM 推理引擎" },
      { value: "openai", label: "OpenAI API", hint: "OpenAI GPT 系列模型" },
      { value: "anthropic", label: "Anthropic API", hint: "Claude 系列模型" },
      { value: "custom", label: "自定义 API", hint: "兼容 OpenAI 的自定义 API" },
    ],
  });
  return choice as string;
}

async function promptServerLocation(prompter: WizardPrompter): Promise<"local" | "remote"> {
  const choice = await prompter.select({
    message: "vLLM 运行位置",
    options: [
      { value: "local", label: "本地服务器", hint: "vLLM 运行在本机" },
      { value: "remote", label: "远程服务器", hint: "vLLM 运行在其他机器上，需要 SSH 连接" },
    ],
  });
  return choice as "local" | "remote";
}

async function promptDeploymentMethod(prompter: WizardPrompter): Promise<"command" | "docker"> {
  const choice = await prompter.select({
    message: "vLLM 部署方式",
    options: [
      { value: "command", label: "命令行", hint: "直接运行 vllm 命令" },
      { value: "docker", label: "Docker 容器", hint: "使用 Docker 容器运行 vLLM" },
    ],
  });
  return choice as "command" | "docker";
}

interface DockerConfigInput {
  image: string;
  containerName?: string;
  gpuDevices?: string;
  volumes?: string[];
  envVars?: Record<string, string>;
  extraArgs?: string;
}

async function promptDockerConfig(prompter: WizardPrompter): Promise<DockerConfigInput> {
  const image = String(await prompter.text({
    message: "vLLM Docker 镜像",
    initialValue: "vllm/vllm:latest",
    placeholder: "例如: vllm/vllm:latest 或 vllm/vllm:0.6.3post1-cu124",
  }));

  const containerName = String(await prompter.text({
    message: "容器名称（可选，留空自动生成）",
    placeholder: "例如: vllm-coder",
  }));

  const useGpu = await prompter.confirm({
    message: "是否启用 GPU 支持？（LLM 推理需要 GPU）",
    initialValue: true,
  });

  let gpuDevices: string | undefined;
  if (useGpu) {
    const gpuChoice = await prompter.select({
      message: "GPU 设备选择",
      options: [
        { value: "all", label: "所有 GPU", hint: "使用服务器上所有 GPU" },
        { value: "0", label: "GPU 0", hint: "仅使用第一个 GPU" },
        { value: "0,1", label: "GPU 0,1", hint: "使用前两个 GPU" },
        { value: "custom", label: "自定义", hint: "手动输入 GPU ID" },
      ],
    });

    if (gpuChoice === "custom") {
      gpuDevices = String(await prompter.text({
        message: "输入 GPU 设备 ID（逗号分隔）",
        placeholder: "例如: 0,1,2",
      }));
    } else {
      gpuDevices = gpuChoice;
    }
  }

  const useVolumes = await prompter.confirm({
    message: "是否需要加载本地模型文件？（如果使用 HuggingFace 模型 ID 则不需要）",
    initialValue: false,
  });

  let volumes: string[] | undefined;
  if (useVolumes) {
    const volumesInput = String(await prompter.text({
      message: "卷挂载（主机路径:容器路径，多个用逗号分隔）",
      placeholder: "例如: /local/models:/models,/data:/data",
    }));
    volumes = volumesInput.split(",").map(v => v.trim()).filter(Boolean);
  }

  const extraArgs = String(await prompter.text({
    message: "额外 Docker 参数（可选）",
    placeholder: "例如: --shm-size=16g",
  }));

  return {
    image: String(image).trim(),
    containerName: containerName.trim() || undefined,
    gpuDevices,
    volumes: volumes?.length ? volumes : undefined,
    extraArgs: extraArgs.trim() || undefined,
  };
}

async function promptRemoteServerConfig(prompter: WizardPrompter, useDocker: boolean = false): Promise<VllmServerConfig> {
  const remoteHost = String(await prompter.text({
    message: "远程服务器地址 (IP 或域名)",
    placeholder: "例如: 192.168.1.100",
  }));

  const remotePortStr = String(await prompter.text({
    message: "vLLM 服务端口",
    initialValue: "8000",
  }));
  const remotePort = parseInt(remotePortStr, 10) || 8000;

  const useSsh = await prompter.confirm({
    message: "是否通过 SSH 启动/停止远程 vLLM？",
    initialValue: true,
  });

  if (!useSsh) {
    return {
      type: "remote",
      host: remoteHost.trim(),
      port: remotePort,
    };
  }

  const sshHost = String(await prompter.text({
    message: "SSH 服务器地址 (留空则使用远程服务器地址)",
    initialValue: remoteHost.trim(),
  }));

  const sshPortStr = String(await prompter.text({
    message: "SSH 端口",
    initialValue: "22",
  }));
  const sshPort = parseInt(sshPortStr, 10) || 22;

  const sshUsername = String(await prompter.text({
    message: "SSH 用户名",
    initialValue: "root",
  }));

  const authMethod = await prompter.select({
    message: "SSH 认证方式",
    options: [
      { value: "key", label: "私钥文件", hint: "使用 SSH 私钥认证（推荐）" },
      { value: "password", label: "密码", hint: "使用密码认证（安全性较低）" },
    ],
  });

  let privateKeyPath: string | undefined;
  let password: string | undefined;

  if (authMethod === "key") {
    const homeDir = process.env.HOME || "";
    privateKeyPath = String(await prompter.text({
      message: "SSH 私钥路径",
      initialValue: `${homeDir}/.ssh/id_rsa`,
    }));
  } else {
    password = String(await prompter.text({
      message: "SSH 密码",
    }));
  }

  return {
    type: "remote",
    host: remoteHost.trim(),
    port: remotePort,
    ssh: {
      enabled: true,
      host: sshHost.trim() || remoteHost.trim(),
      port: sshPort,
      username: sshUsername.trim(),
      privateKeyPath: privateKeyPath?.trim(),
      password: password?.trim(),
    },
  };
}

async function promptDockerServerConfig(prompter: WizardPrompter, isRemote: boolean = false): Promise<VllmServerConfig> {
  if (isRemote) {
    await prompter.note(
      "确保远程服务器已安装 Docker 并具有 GPU 支持。可运行 'docker run --gpus all nvidia/cuda:12.1-base nvidia-smi' 测试。",
      "前提条件",
    );
  }

  let host = "127.0.0.1";
  let ssh: VllmServerConfig["ssh"] | undefined;

  if (isRemote) {
    const sshHost = String(await prompter.text({
      message: "SSH 服务器地址 (IP 或域名)",
      placeholder: "例如: 192.168.1.100",
    }));

    const sshPortStr = String(await prompter.text({
      message: "SSH 端口",
      initialValue: "22",
    }));
    const sshPort = parseInt(sshPortStr, 10) || 22;

    const sshUsername = String(await prompter.text({
      message: "SSH 用户名",
      initialValue: "root",
    }));

    const authMethod = await prompter.select({
      message: "SSH 认证方式",
      options: [
        { value: "key", label: "私钥文件", hint: "使用 SSH 私钥认证（推荐）" },
        { value: "password", label: "密码", hint: "使用密码认证（安全性较低）" },
      ],
    });

    let privateKeyPath: string | undefined;
    let password: string | undefined;

    if (authMethod === "key") {
      const homeDir = process.env.HOME || "";
      privateKeyPath = String(await prompter.text({
        message: "SSH 私钥路径",
        initialValue: `${homeDir}/.ssh/id_rsa`,
      }));
    } else {
      password = String(await prompter.text({
        message: "SSH 密码",
      }));
    }

    host = String(await prompter.text({
      message: "远程服务器地址（Docker 主机）",
      placeholder: "例如: 192.168.1.100",
    }));

    ssh = {
      enabled: true,
      host: sshHost.trim(),
      port: sshPort,
      username: sshUsername.trim(),
      privateKeyPath: privateKeyPath?.trim(),
      password: password?.trim(),
    };
  } else {
    host = String(await prompter.text({
      message: "Docker 主机地址",
      initialValue: "127.0.0.1",
    }));
  }

  const dockerConfig = await promptDockerConfig(prompter);

  return {
    type: "docker",
    host: host.trim(),
    port: 8000,
    ssh,
    docker: {
      enabled: true,
      image: dockerConfig.image,
      containerName: dockerConfig.containerName,
      gpuDevices: dockerConfig.gpuDevices,
      volumes: dockerConfig.volumes,
      extraArgs: dockerConfig.extraArgs,
    },
  };
}

async function promptRemoteServerConfigSglang(prompter: WizardPrompter): Promise<SglangServerConfig> {
  const remoteHost = String(await prompter.text({
    message: "远程服务器地址 (IP 或域名)",
    placeholder: "例如: 192.168.1.100",
  }));

  const remotePortStr = String(await prompter.text({
    message: "SGLang 服务端口",
    initialValue: "9000",
  }));
  const remotePort = parseInt(remotePortStr, 10) || 9000;

  const useSsh = await prompter.confirm({
    message: "是否通过 SSH 启动/停止远程 SGLang？",
    initialValue: true,
  });

  let ssh: SglangServerConfig["ssh"] | undefined;
  let host = remoteHost.trim();

  if (useSsh) {
    const sshHost = String(await prompter.text({
      message: "SSH 服务器地址 (留空则使用远程服务器地址)",
      initialValue: remoteHost.trim(),
    }));

    const sshPortStr = String(await prompter.text({
      message: "SSH 端口",
      initialValue: "22",
    }));
    const sshPort = parseInt(sshPortStr, 10) || 22;

    const sshUsername = String(await prompter.text({
      message: "SSH 用户名",
      initialValue: "root",
    }));

    const usePrivateKey = await prompter.confirm({
      message: "是否使用 SSH 私钥认证？",
      initialValue: true,
    });

    let privateKeyPath: string | undefined;
    let password: string | undefined;

    if (usePrivateKey) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      privateKeyPath = String(await prompter.text({
        message: "SSH 私钥路径",
        initialValue: `${homeDir}/.ssh/id_rsa`,
      }));
    } else {
      password = String(await prompter.text({
        message: "SSH 密码",
      }));
    }

    ssh = {
      host: sshHost.trim(),
      port: sshPort,
      username: sshUsername.trim(),
      privateKeyPath: privateKeyPath?.trim(),
    };
  }

  return {
    type: "remote",
    host: host.trim(),
    port: remotePort,
    ssh,
  };
}

async function promptDockerServerConfigSglang(prompter: WizardPrompter, isRemote: boolean = false): Promise<SglangServerConfig> {
  if (isRemote) {
    await prompter.note(
      "确保远程服务器已安装 Docker 并具有 GPU 支持。可运行 'docker run --gpus all nvidia/cuda:12.1-base nvidia-smi' 测试。",
      "前提条件",
    );
  }

  let host = "127.0.0.1";
  let ssh: SglangServerConfig["ssh"] | undefined;

  if (isRemote) {
    const sshHost = String(await prompter.text({
      message: "SSH 服务器地址",
      placeholder: "例如: 192.168.1.100",
    }));

    const sshPortStr = String(await prompter.text({
      message: "SSH 端口",
      initialValue: "22",
    }));
    const sshPort = parseInt(sshPortStr, 10) || 22;

    const sshUsername = String(await prompter.text({
      message: "SSH 用户名",
      initialValue: "root",
    }));

    const usePrivateKey = await prompter.confirm({
      message: "是否使用 SSH 私钥认证？",
      initialValue: true,
    });

    let privateKeyPath: string | undefined;

    if (usePrivateKey) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      privateKeyPath = String(await prompter.text({
        message: "SSH 私钥路径",
        initialValue: `${homeDir}/.ssh/id_rsa`,
      }));
    }

    host = String(await prompter.text({
      message: "远程服务器地址（Docker 主机）",
      placeholder: "例如: 192.168.1.100",
    }));

    ssh = {
      host: sshHost.trim(),
      port: sshPort,
      username: sshUsername.trim(),
      privateKeyPath: privateKeyPath?.trim(),
    };
  } else {
    host = String(await prompter.text({
      message: "Docker 主机地址",
      initialValue: "127.0.0.1",
    }));
  }

  const dockerConfig = await promptDockerConfig(prompter);

  return {
    type: "docker",
    host: host.trim(),
    port: 9000,
    ssh,
    docker: {
      enabled: true,
      image: dockerConfig.image,
      containerName: dockerConfig.containerName,
      gpuDevices: dockerConfig.gpuDevices,
      volumes: dockerConfig.volumes,
      extraArgs: dockerConfig.extraArgs,
    },
  };
}

async function promptBaseUrl(prompter: WizardPrompter, provider: string): Promise<string> {
  const defaultUrls: Record<string, string> = {
    vllm: "http://localhost:8000/v1",
    sglang: "http://localhost:8000/v1",
    ollama: "http://localhost:11434",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    custom: "http://localhost:8000/v1",
  };

  const url = await prompter.text({
    message: "API 基础 URL",
    initialValue: defaultUrls[provider] || "http://localhost:8000/v1",
  });
  return String(url || defaultUrls[provider]);
}

async function promptModelName(prompter: WizardPrompter, provider: string): Promise<string> {
  const defaultModels: Record<string, string> = {
    vllm: "qwen2.5-7b-instruct",
    sglang: "qwen2.5-7b-instruct",
    ollama: "llama3.1",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-20241022",
    custom: "gpt-4o-mini",
  };

  const model = await prompter.text({
    message: "模型名称",
    initialValue: defaultModels[provider],
  });
  return String(model || defaultModels[provider]);
}

interface GpuMemoryConfig {
  gpuMemoryUtilization?: number;
  maxModelLen?: number;
}

async function promptGpuMemoryConfig(prompter: WizardPrompter): Promise<GpuMemoryConfig> {
  const enableLimit = await prompter.confirm({
    message: "是否需要限制 GPU 显存使用？（避免 OOM）",
    initialValue: false,
  });

  if (!enableLimit) {
    return {};
  }

  const gpuMemoryUtilization = Number(await prompter.text({
    message: "GPU 显存利用率 (0.0-1.0)",
    placeholder: "例如: 0.9 表示使用 90% 显存",
    initialValue: "0.9",
  }));

  const hasMaxModelLen = await prompter.confirm({
    message: "是否限制模型最大上下文长度？（可减少显存）",
    initialValue: false,
  });

  let maxModelLen: number | undefined;
  if (hasMaxModelLen) {
    maxModelLen = Number(await prompter.text({
      message: "最大上下文长度",
      placeholder: "例如: 32768",
      initialValue: "32768",
    }));
  }

  return {
    gpuMemoryUtilization: gpuMemoryUtilization || 0.9,
    maxModelLen,
  };
}

async function promptSubagentName(prompter: WizardPrompter): Promise<string> {
  const name = await prompter.text({
    message: "子智能体名称",
    placeholder: "例如：代码助手",
  });
  return String(name).trim();
}

async function promptSubagentLabel(prompter: WizardPrompter): Promise<string> {
  const label = await prompter.text({
    message: "子智能体标识符 (label)",
    placeholder: "例如：coding-agent",
  });
  return String(label).trim().toLowerCase().replace(/\s+/g, "-");
}

async function promptSubagentDescription(prompter: WizardPrompter): Promise<string> {
  const description = await prompter.text({
    message: "子智能体工作内容描述",
    placeholder: "例如：帮我写代码、调试bug",
  });
  return String(description).trim();
}

async function promptSubagentCount(prompter: WizardPrompter): Promise<number> {
  const countStr = await prompter.text({
    message: "创建数量",
    initialValue: "1",
  });
  const count = parseInt(String(countStr).trim(), 10);
  return isNaN(count) || count < 1 ? 1 : count > 10 ? 10 : count;
}

async function handleAIEnhancement(
  prompter: WizardPrompter,
  cfg: OpenClawConfig,
  config: SubagentConfig,
): Promise<SubagentConfig> {
  const endpointStatus = await checkMainAgentEndpoint(cfg);

  if (!endpointStatus.available) {
    const skipEnhance = await prompter.confirm({
      message: `AI 增强跳过：${endpointStatus.reason}。是否跳过人格增强？`,
      initialValue: true,
    });

    if (skipEnhance) {
      await prompter.note(
        "已跳过 AI 增强。可在主智能体模型服务启动后，通过 'openclaw subagent enhance <id>' 手动增强。",
        "跳过"
      );
      return config;
    } else {
      await prompter.note("请先启动主智能体模型服务，或选择其他模型供应商。", "提示");
      return config;
    }
  }

  const shouldEnhance = await prompter.confirm({
    message: "使用 AI 增强人格描述？（需要主智能体模型）",
    initialValue: true,
  });

  if (shouldEnhance) {
    await prompter.note("正在使用 AI 增强人格描述...", "请稍候");
    config = await enhanceSubagentConfig(config, endpointStatus.endpoint!);
    if (config.personality?.enhanced) {
      await prompter.note(
        `增强后的人格描述：\n${config.personality.enhanced.slice(0, 200)}...`,
        "人格已增强"
      );
    }
  }

  return config;
}

export async function setupAgents(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const subagents = listSubagents();
  const hasSubagents = subagents.length > 0;

  const statusLines: string[] = [
    `当前子智能体数量: ${subagents.length || 0}`,
    "",
    "子智能体列表:",
  ];

  if (subagents.length > 0) {
    for (const sa of subagents) {
      const modelInfo = `${sa.model.endpoint.provider} - ${sa.model.endpoint.model}`;
      statusLines.push(`  - ${sa.name} [${sa.id}]`);
      statusLines.push(`    模型: ${modelInfo}`);
      if (sa.personality?.enhanced) {
        statusLines.push(`    人格: ✅ 已增强`);
      }
    }
  } else {
    statusLines.push("  - 暂无子智能体");
  }

  statusLines.push("");
  statusLines.push("vLLM 子智能体系统允许不同任务由专业 AI 模型处理。");
  statusLines.push("例如：编程任务由代码模型处理，数学任务由数学模型处理。");
  statusLines.push("每个子智能体有独立的模型服务，按需启动和停止。");
  statusLines.push("支持供应商：vLLM、Ollama、SGLang、OpenAI、Anthropic、自定义 API。");

  await prompter.note(statusLines.join("\n"), "vLLM 子智能体配置");

  const shouldConfigure = await prompter.confirm({
    message: "配置 vLLM 子智能体？",
    initialValue: !hasSubagents,
  });

  if (!shouldConfigure) {
    return cfg;
  }

  let continueConfiguring = true;

  while (continueConfiguring) {
    const action = await prompter.select({
      message: "选择操作",
      options: [
        { value: "create", label: "创建子智能体", hint: "从模板选择或手动填写" },
        { value: "list", label: "查看列表", hint: "查看已创建的子智能体" },
        { value: "done", label: "完成", hint: "退出配置" },
      ],
    });

    if (action === "list") {
      const currentList = listSubagents();
      if (currentList.length === 0) {
        await prompter.note("暂无子智能体", "列表");
      } else {
        const listLines: string[] = [];
        for (const sa of currentList) {
          listLines.push(`📌 ${sa.name} (${sa.id})`);
          listLines.push(`   描述: ${sa.description}`);
          listLines.push(`   模型: ${sa.model.endpoint.provider} - ${sa.model.endpoint.model}`);
          listLines.push("");
        }
        await prompter.note(listLines.join("\n"), "子智能体列表");
      }
      continue;
    }

    if (action === "done") {
      continueConfiguring = false;
      break;
    }

    if (action === "create") {
      let continueCreating = true;

      while (continueCreating) {
        const createType = await prompter.select({
          message: "创建方式",
          options: [
            { value: "template", label: "从模板选择", hint: "基于预置模板创建" },
            { value: "manual", label: "手动填写", hint: "完全自定义配置" },
          ],
        });

        let config: SubagentConfig;

        if (createType === "template") {
          const templateOptions = getTemplateNames().map((t) => ({
            value: t.id,
            label: t.name,
            hint: t.description.slice(0, 40) + "...",
          }));

          const selectedId = await prompter.select({
            message: "选择子智能体模板",
            options: templateOptions,
          });

          const template = getTemplateById(selectedId);
          if (!template) {
            await prompter.note("模板不存在", "错误");
            break;
          }

          const name = await promptSubagentName(prompter);
          const label = await promptSubagentLabel(prompter);
          const description = await promptSubagentDescription(prompter);

          config = createSubagentFromTemplate(template, {
            id: label || `subagent-${Date.now()}`,
            name: name || template.name,
            description: description || template.exampleDescription,
          });

          const modifyModel = await prompter.confirm({
            message: "是否修改模型配置？（当前使用模板默认模型）",
            initialValue: false,
          });

          if (modifyModel) {
            const provider = await promptModelProvider(prompter);
            let baseUrl: string;
            let server: VllmServerConfig | SglangServerConfig | undefined;
            
            if (provider === "vllm" || provider === "sglang") {
              const serverLocation = await promptServerLocation(prompter);
              const deploymentMethod = await promptDeploymentMethod(prompter);
              
              if (serverLocation === "local" && deploymentMethod === "command") {
                baseUrl = await promptBaseUrl(prompter, provider);
              } else if (serverLocation === "remote" && deploymentMethod === "command") {
                server = provider === "vllm" 
                  ? await promptRemoteServerConfig(prompter, false)
                  : await promptRemoteServerConfigSglang(prompter);
                baseUrl = `http://${(server as VllmServerConfig).host}:${(server as VllmServerConfig).port}/v1`;
              } else if (deploymentMethod === "docker") {
                server = provider === "vllm" 
                  ? await promptDockerServerConfig(prompter, serverLocation === "remote")
                  : await promptDockerServerConfigSglang(prompter, serverLocation === "remote");
                baseUrl = `http://${(server as VllmServerConfig).host}:${(server as VllmServerConfig).port}/v1`;
              } else {
                baseUrl = await promptBaseUrl(prompter, provider);
              }
            } else {
              baseUrl = await promptBaseUrl(prompter, provider);
            }
            
            const model = await promptModelName(prompter, provider);

            let gpuMemoryConfig: GpuMemoryConfig = {};
            if (provider === "vllm" || provider === "sglang") {
              gpuMemoryConfig = await promptGpuMemoryConfig(prompter);
            }

            config.model.endpoint = {
              provider: provider as any,
              baseUrl,
              model,
              server: server as any,
              gpuMemoryUtilization: gpuMemoryConfig.gpuMemoryUtilization,
              maxModelLen: gpuMemoryConfig.maxModelLen,
            };
          }
        } else {
          const name = await promptSubagentName(prompter);
          const label = await promptSubagentLabel(prompter);
          const description = await promptSubagentDescription(prompter);

          const provider = await promptModelProvider(prompter);
          let baseUrl: string;
          let server: VllmServerConfig | SglangServerConfig | undefined;
          
          if (provider === "vllm" || provider === "sglang") {
            const serverLocation = await promptServerLocation(prompter);
            const deploymentMethod = await promptDeploymentMethod(prompter);
            
            if (serverLocation === "local" && deploymentMethod === "command") {
              baseUrl = await promptBaseUrl(prompter, provider);
            } else if (serverLocation === "remote" && deploymentMethod === "command") {
              server = provider === "vllm" 
                ? await promptRemoteServerConfig(prompter, false)
                : await promptRemoteServerConfigSglang(prompter);
              baseUrl = `http://${(server as VllmServerConfig).host}:${(server as VllmServerConfig).port}/v1`;
            } else if (deploymentMethod === "docker") {
              server = provider === "vllm" 
                ? await promptDockerServerConfig(prompter, serverLocation === "remote")
                : await promptDockerServerConfigSglang(prompter, serverLocation === "remote");
              baseUrl = `http://${(server as VllmServerConfig).host}:${(server as VllmServerConfig).port}/v1`;
            } else {
              baseUrl = await promptBaseUrl(prompter, provider);
            }
          } else {
            baseUrl = await promptBaseUrl(prompter, provider);
          }
          
          const model = await promptModelName(prompter, provider);

          let gpuMemoryConfig: GpuMemoryConfig = {};
          if (provider === "vllm" || provider === "sglang") {
            gpuMemoryConfig = await promptGpuMemoryConfig(prompter);
          }

          const endpoint: ModelEndpoint = {
            provider: provider as any,
            baseUrl,
            model,
            server: server as any,
            gpuMemoryUtilization: gpuMemoryConfig.gpuMemoryUtilization,
            maxModelLen: gpuMemoryConfig.maxModelLen,
          };

          config = {
            id: label || `subagent-${Date.now()}`,
            name: name || "自定义子智能体",
            description,
            model: {
              endpoint,
            },
            behavior: {
              autoLoad: true,
              autoUnload: true,
              unloadDelayMs: 5000,
              temperature: 0.7,
              maxTokens: 4096,
            },
          };
        }

        config = await handleAIEnhancement(prompter, cfg, config);
        addSubagent(config);
        createSubagentWorkspaceFromConfig(config);

        await prompter.note(
          `已创建子智能体: ${config.name}\n模型: ${config.model.endpoint.provider} - ${config.model.endpoint.model}`,
          "创建成功"
        );

        continueCreating = await prompter.confirm({
          message: "是否继续创建更多子智能体？",
          initialValue: true,
        });
      }
    }
  }

  await prompter.note(
    "子智能体配置完成。可使用 'openclaw subagent list' 查看和管理。",
    "配置完成"
  );

  return cfg;
}
