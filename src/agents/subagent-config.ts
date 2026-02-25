import { Type } from "@sinclair/typebox";
import type { VllmServerConfig } from "./subagent-vllm-config.js";

export type ModelProvider = "vllm" | "ollama" | "sglang" | "openai" | "anthropic" | "custom";

export const ModelProviderSchema = Type.Union([
  Type.Literal("vllm"),
  Type.Literal("ollama"),
  Type.Literal("sglang"),
  Type.Literal("openai"),
  Type.Literal("anthropic"),
  Type.Literal("custom"),
]);

export const ModelEndpointSchema = Type.Object({
  provider: ModelProviderSchema,
  baseUrl: Type.String({ description: "API 基础 URL" }),
  apiKey: Type.Optional(Type.String({ description: "API Key（可选）" })),
  model: Type.String({ description: "模型名称" }),
  timeout: Type.Optional(Type.Number({ description: "请求超时（毫秒）" })),
  server: Type.Optional(Type.Any({ description: "vLLM/SGLang 服务器配置" })),
});

export type ModelEndpoint = {
  provider: ModelProvider;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeout?: number;
  server?: VllmServerConfig;
};

export const ModelFallbackConfigSchema = Type.Object({
  enabled: Type.Boolean({ description: "是否启用回退" }),
  endpoints: Type.Array(ModelEndpointSchema, { description: "备用端点列表" }),
  maxRetries: Type.Optional(Type.Number({ description: "最大重试次数" })),
});

export type ModelFallbackConfig = {
  enabled: boolean;
  endpoints: ModelEndpoint[];
  maxRetries?: number;
};

export const SubagentBehaviorSchema = Type.Object({
  temperature: Type.Optional(Type.Number({ description: "0-2 随机性" })),
  topP: Type.Optional(Type.Number({ description: "0-1 核采样" })),
  maxTokens: Type.Optional(Type.Number({ description: "最大输出 tokens" })),
  maxModelLen: Type.Optional(Type.Number({ description: "最大模型上下文长度" })),
  gpuMemoryUtilization: Type.Optional(Type.Number({ description: "GPU 显存利用率 (0-1)" })),
  tensorParallelSize: Type.Optional(Type.Number({ description: "Tensor 并行大小" })),
  maxConcurrentRequests: Type.Optional(Type.Number({ description: "最大并发请求数" })),
  timeoutMs: Type.Optional(Type.Number({ description: "请求超时（毫秒）" })),
  autoLoad: Type.Optional(Type.Boolean({ description: "创建时启动模型服务" })),
  autoUnload: Type.Optional(Type.Boolean({ description: "完成后停止模型服务" })),
  unloadDelayMs: Type.Optional(Type.Number({ description: "延迟停止时间（毫秒）" })),
  idleTimeoutMs: Type.Optional(Type.Number({ description: "空闲超时自动停止（毫秒）" })),
  maxRunTimeMs: Type.Optional(Type.Number({ description: "最大运行时间（毫秒）" })),
});

export type SubagentBehavior = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  maxModelLen?: number;
  gpuMemoryUtilization?: number;
  tensorParallelSize?: number;
  maxConcurrentRequests?: number;
  timeoutMs?: number;
  autoLoad?: boolean;
  autoUnload?: boolean;
  unloadDelayMs?: number;
  idleTimeoutMs?: number;
  maxRunTimeMs?: number;
};

export type SubagentCategory = "coding" | "writing" | "reasoning" | "research" | "translation" | "data" | "creative" | "general";

export const SubagentCategorySchema = Type.Union([
  Type.Literal("coding"),
  Type.Literal("writing"),
  Type.Literal("reasoning"),
  Type.Literal("research"),
  Type.Literal("translation"),
  Type.Literal("data"),
  Type.Literal("creative"),
  Type.Literal("general"),
]);

export const SubagentMetadataSchema = Type.Object({
  category: Type.Optional(SubagentCategorySchema),
  tags: Type.Optional(Type.Array(Type.String())),
  language: Type.Optional(Type.Array(Type.String())),
  isTemplate: Type.Optional(Type.Boolean()),
  author: Type.Optional(Type.String()),
  version: Type.Optional(Type.String()),
});

export type SubagentMetadata = {
  category?: SubagentCategory;
  tags?: string[];
  language?: string[];
  isTemplate?: boolean;
  author?: string;
  version?: string;
};

export const SubagentPersonalitySchema = Type.Object({
  base: Type.String({ description: "基础人格描述" }),
  enhanced: Type.Optional(Type.String({ description: "AI 增强后的人格描述" })),
  enhancedBy: Type.Optional(Type.String({ description: "用于增强的模型 ID" })),
  enhancedAt: Type.Optional(Type.String({ description: "增强时间 ISO 格式" })),
});

export type SubagentPersonality = {
  base: string;
  enhanced?: string;
  enhancedBy?: string;
  enhancedAt?: string;
};

export const SubagentModelConfigSchema = Type.Object({
  endpoint: ModelEndpointSchema,
  fallback: Type.Optional(ModelFallbackConfigSchema),
});

export type SubagentModelConfig = {
  endpoint: ModelEndpoint;
  fallback?: ModelFallbackConfig;
};

export const SubagentConfigSchema = Type.Object({
  id: Type.String({ description: "子智能体唯一标识符" }),
  name: Type.String({ description: "显示名称" }),
  description: Type.String({ description: "工作内容描述" }),
  metadata: Type.Optional(SubagentMetadataSchema),
  personality: Type.Optional(SubagentPersonalitySchema),
  model: SubagentModelConfigSchema,
  behavior: Type.Optional(SubagentBehaviorSchema),
  systemPrompt: Type.Optional(Type.String({ description: "自定义系统提示词" })),
  workspaceDir: Type.Optional(Type.String({ description: "工作目录路径（可选）" })),
});

export interface SubagentConfig {
  id: string;
  name: string;
  description: string;
  metadata?: SubagentMetadata;
  personality?: SubagentPersonality;
  model: SubagentModelConfig;
  behavior?: SubagentBehavior;
  systemPrompt?: string;
  workspaceDir?: string;
}

export const SUBAGENTS_CONFIG_FILENAME = "subagents.json";
export const SUBAGENT_TEMPLATES_DIR = "subagent-templates";
