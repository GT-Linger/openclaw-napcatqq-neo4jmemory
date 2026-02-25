import { resolveOpenClawAgentDir } from "./agent-paths.js";
import type { ModelProvider, SubagentConfig, SubagentBehavior, ModelEndpoint } from "./subagent-config.js";
import { SUBAGENT_TEMPLATES, getTemplateById, getTemplateNames, createSubagentFromTemplate } from "./subagent-templates.js";
import { enhanceSubagentConfig, canEnhancePersonality } from "./subagent-personality-enhancer.js";
import { addSubagent, getSubagentById, updateSubagent, removeSubagent, listSubagents, duplicateSubagent } from "./subagent-manager.js";
import { createSubagentWorkspaceFromConfig } from "./subagent-workspace.js";
import { input, confirm, select } from "../cli/prompts.js";
import { logInfo, logSuccess, logError } from "../logger.js";

export interface MainAgentEndpoint {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

const PROVIDER_OPTIONS: { value: ModelProvider; label: string; hint: string }[] = [
  { value: "vllm", label: "vLLM", hint: "高性能 LLM 推理服务" },
  { value: "ollama", label: "Ollama", hint: "本地 LLM 推理框架" },
  { value: "sglang", label: "SGLang", hint: "快速 LLM 推理引擎" },
  { value: "openai", label: "OpenAI API", hint: "OpenAI GPT 系列模型" },
  { value: "anthropic", label: "Anthropic API", hint: "Claude 系列模型" },
  { value: "custom", label: "自定义 API", hint: "兼容 OpenAI 的自定义 API" },
];

async function promptSubagentName(): Promise<string> {
  const name = await input({
    message: "子智能体名称",
    placeholder: "例如：代码助手",
  });
  return name.trim();
}

async function promptSubagentLabel(): Promise<string> {
  const label = await input({
    message: "子智能体标识符 (label)",
    placeholder: "例如：coding-agent",
  });
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

async function promptSubagentDescription(): Promise<string> {
  const description = await input({
    message: "子智能体工作内容描述",
    placeholder: "例如：帮我写代码、调试bug",
  });
  return description.trim();
}

async function promptModelProvider(): Promise<ModelProvider> {
  const provider = await select<ModelProvider>({
    message: "选择模型供应商",
    options: PROVIDER_OPTIONS,
  });
  return provider;
}

async function promptBaseUrl(provider: ModelProvider): Promise<string> {
  const defaultUrls: Record<ModelProvider, string> = {
    vllm: "http://localhost:8000",
    sglang: "http://localhost:8000",
    ollama: "http://localhost:11434",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    custom: "http://localhost:8000/v1",
  };

  const url = await input({
    message: "API 基础 URL",
    placeholder: defaultUrls[provider],
    initialValue: defaultUrls[provider],
  });
  return url.trim() || defaultUrls[provider];
}

async function promptApiKey(provider: ModelProvider): Promise<string | undefined> {
  if (provider === "ollama" || provider === "vllm" || provider === "sglang") {
    return undefined;
  }

  const useKey = await confirm({
    message: "需要 API Key 吗？",
    initialValue: false,
  });

  if (!useKey) {
    return undefined;
  }

  const key = await input({
    message: "API Key",
    placeholder: "sk-...",
  });
  return key.trim() || undefined;
}

async function promptModelName(provider: ModelProvider): Promise<string> {
  const defaultModels: Record<ModelProvider, string> = {
    vllm: "qwen2.5-7b-instruct",
    sglang: "qwen2.5-7b-instruct",
    ollama: "llama3.1",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-20241022",
    custom: "gpt-4o-mini",
  };

  const model = await input({
    message: "模型名称",
    placeholder: defaultModels[provider],
    initialValue: defaultModels[provider],
  });
  return model.trim() || defaultModels[provider];
}

async function promptBehavior(): Promise<SubagentBehavior> {
  const autoLoad = await confirm({
    message: "创建子智能体时自动启动模型服务？",
    initialValue: true,
  });

  const autoUnload = await confirm({
    message: "子智能体任务完成后自动停止模型服务？",
    initialValue: true,
  });

  let unloadDelayMs = 5000;
  if (autoUnload) {
    const delayStr = await input({
      message: "停止延迟（毫秒）",
      placeholder: "5000",
      initialValue: "5000",
    });
    unloadDelayMs = parseInt(delayStr || "5000", 10);
  }

  const temperatureStr = await input({
    message: "Temperature (0-2)",
    placeholder: "0.7",
    initialValue: "0.7",
  });

  const maxTokensStr = await input({
    message: "最大输出 Tokens",
    placeholder: "4096",
    initialValue: "4096",
  });

  return {
    autoLoad,
    autoUnload,
    unloadDelayMs,
    temperature: parseFloat(temperatureStr || "0.7"),
    maxTokens: parseInt(maxTokensStr || "4096", 10),
  };
}

async function promptUseTemplate(): Promise<boolean> {
  return confirm({
    message: "从模板创建子智能体？",
    initialValue: true,
  });
}

async function promptSelectTemplate(): Promise<string | null> {
  const templates = getTemplateNames();

  const choice = await select({
    message: "选择模板",
    options: [
      { value: "__custom", label: "从零创建", hint: "自定义配置" },
      ...templates.map((t) => ({
        value: t.id,
        label: t.name,
        hint: t.description.slice(0, 30) + "...",
      })),
    ],
  });

  if (choice === "__custom") {
    return null;
  }

  return choice;
}

export async function createSubagentWizard(mainAgentEndpoint?: MainAgentEndpoint): Promise<SubagentConfig | null> {
  console.log("\n=== 创建子智能体 ===\n");

  const useTemplate = await promptUseTemplate();

  let config: SubagentConfig;

  if (useTemplate) {
    const templateId = await promptSelectTemplate();

    if (templateId) {
      const template = getTemplateById(templateId);
      if (!template) {
        logError("模板不存在");
        return null;
      }

      const name = await promptSubagentName();
      const label = await promptSubagentLabel();
      const description = await promptSubagentDescription();

      config = createSubagentFromTemplate(template, {
        id: label,
        name: name || template.name,
        description: description || template.exampleDescription,
      });
    } else {
      config = await buildSubagentConfigFromScratch();
    }
  } else {
    config = await buildSubagentConfigFromScratch();
  }

  const enhanceEnabled = mainAgentEndpoint && canEnhancePersonality(mainAgentEndpoint);

  if (enhanceEnabled) {
    const enhance = await confirm({
      message: "使用 AI 增强人格描述？（需要主智能体模型）",
      initialValue: true,
    });

    if (enhance) {
      logInfo("正在使用 AI 增强人格描述...");
      config = await enhanceSubagentConfig(config, mainAgentEndpoint);
      if (config.personality?.enhanced) {
        console.log("\n=== 增强后的人格描述 ===");
        console.log(config.personality.enhanced.slice(0, 500) + "...");
        console.log("========================\n");
      }
    }
  }

  console.log("\n=== 配置预览 ===");
  console.log(JSON.stringify(config, null, 2));
  console.log("================\n");

  const save = await confirm({
    message: "确认保存？",
    initialValue: true,
  });

  if (save) {
    try {
      addSubagent(config);
      createSubagentWorkspaceFromConfig(config);
      logSuccess(`子智能体 "${config.name}" 创建成功！`);
      return config;
    } catch (error) {
      logError(`保存失败: ${error}`);
      return null;
    }
  }

  logInfo("已取消创建");
  return null;
}

async function buildSubagentConfigFromScratch(): Promise<SubagentConfig> {
  const name = await promptSubagentName();
  const label = await promptSubagentLabel();
  const description = await promptSubagentDescription();

  const provider = await promptModelProvider();
  const baseUrl = await promptBaseUrl(provider);
  const apiKey = await promptApiKey(provider);
  const model = await promptModelName(provider);
  const behavior = await promptBehavior();

  const endpoint: ModelEndpoint = {
    provider,
    baseUrl,
    model,
    apiKey,
  };

  return {
    id: label,
    name,
    description,
    model: {
      endpoint,
    },
    behavior,
  };
}

export async function editSubagentWizard(
  subagentId: string,
  mainAgentEndpoint?: MainAgentEndpoint
): Promise<SubagentConfig | null> {
  const existing = getSubagentById(subagentId);
  if (!existing) {
    logError(`子智能体 "${subagentId}" 不存在`);
    return null;
  }

  console.log(`\n=== 编辑子智能体: ${existing.name} ===\n`);

  const continueEdit = await confirm({
    message: "继续编辑？",
    initialValue: true,
  });

  if (!continueEdit) {
    return null;
  }

  const name = await input({
    message: "名称",
    initialValue: existing.name,
  });

  const description = await input({
    message: "描述",
    initialValue: existing.description,
  });

  const updateData: Partial<SubagentConfig> = {
    name: name.trim() || existing.name,
    description: description.trim() || existing.description,
  };

  const enhanceEnabled = mainAgentEndpoint && canEnhancePersonality(mainAgentEndpoint);
  if (enhanceEnabled) {
    const enhance = await confirm({
      message: "重新使用 AI 增强人格描述？",
      initialValue: false,
    });

    if (enhance) {
      logInfo("正在使用 AI 重新增强人格描述...");
      const enhanced = await enhanceSubagentConfig(
        { ...existing, ...updateData },
        mainAgentEndpoint
      );
      updateData.personality = enhanced.personality;
    }
  }

  updateSubagent(subagentId, updateData);

  const updated = getSubagentById(subagentId);
  logSuccess(`子智能体 "${updated?.name}" 更新成功！`);
  return updated;
}

export async function listSubagentsWizard(): Promise<void> {
  const subagents = listSubagents();

  if (subagents.length === 0) {
    console.log("\n尚未创建任何子智能体");
    console.log("运行 'openclaw subagent create' 创建第一个子智能体\n");
    return;
  }

  console.log("\n=== 子智能体列表 ===");
  for (const sa of subagents) {
    console.log(`\n📌 ${sa.name} (${sa.id})`);
    console.log(`   描述: ${sa.description}`);
    console.log(`   模型: ${sa.model.endpoint.provider} - ${sa.model.endpoint.model}`);
    if (sa.personality?.enhanced) {
      console.log(`   人格: ✅ 已增强`);
    }
    if (sa.behavior) {
      console.log(`   自动启停: ${sa.behavior.autoLoad ? "启动" : "手动"}/${sa.behavior.autoUnload ? "停止" : "手动"}`);
    }
  }
  console.log("\n===================\n");
}

export async function deleteSubagentWizard(subagentId: string): Promise<boolean> {
  const existing = getSubagentById(subagentId);
  if (!existing) {
    logError(`子智能体 "${subagentId}" 不存在`);
    return false;
  }

  const confirmDelete = await confirm({
    message: `确认删除子智能体 "${existing.name}"？`,
    initialValue: false,
  });

  if (confirmDelete) {
    removeSubagent(subagentId);
    logSuccess(`子智能体 "${existing.name}" 已删除`);
    return true;
  }

  logInfo("已取消删除");
  return false;
}

export async function duplicateSubagentWizard(): Promise<void> {
  const subagents = listSubagents();

  if (subagents.length === 0) {
    logError("没有可复制的子智能体");
    return;
  }

  const source = await select({
    message: "选择要复制的子智能体",
    options: subagents.map((s) => ({
      value: s.id,
      label: s.name,
      hint: s.description.slice(0, 30),
    })),
  });

  const newId = await input({
    message: "新子智能体标识符",
    placeholder: `${source}-copy`,
  });

  const newName = await input({
    message: "新子智能体名称",
    placeholder: `${subagents.find((s) => s.id === source)?.name} (副本)`,
  });

  const duplicate = duplicateSubagent(
    source,
    newId.trim() || `${source}-copy`,
    newName.trim() || `${subagents.find((s) => s.id === source)?.name} (副本)`
  );

  if (duplicate) {
    logSuccess(`子智能体复制成功: ${duplicate.name}`);
  } else {
    logError("复制失败");
  }
}
