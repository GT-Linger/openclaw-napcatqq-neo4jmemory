import { Type } from "@sinclair/typebox";

export const VllmServerConfigSchema = Type.Object({
  type: Type.Union([
    Type.Literal("local"), 
    Type.Literal("remote"),
    Type.Literal("docker")
  ], {
    description: "vLLM 服务器类型: local=本地命令行, remote=远程服务器命令行, docker=本地Docker部署"
  }),
  host: Type.Optional(Type.String({ description: "远程服务器 IP/hostname" })),
  port: Type.Optional(Type.Number({ description: "vLLM 服务端口" })),
  ssh: Type.Optional(Type.Object({
    enabled: Type.Boolean({ description: "是否使用 SSH 连接" }),
    host: Type.String({ description: "SSH 服务器地址" }),
    port: Type.Optional(Type.Number({ description: "SSH 端口，默认 22" })),
    username: Type.String({ description: "SSH 用户名" }),
    privateKeyPath: Type.Optional(Type.String({ description: "SSH 私钥路径" })),
    password: Type.Optional(Type.String({ description: "SSH 密码（建议使用私钥）" })),
  })),
  docker: Type.Optional(Type.Object({
    enabled: Type.Boolean({ description: "是否使用 Docker 部署" }),
    image: Type.String({ description: "vLLM Docker 镜像名称" }),
    containerName: Type.Optional(Type.String({ description: "容器名称（可选）" })),
    gpuDevices: Type.Optional(Type.String({ description: "GPU设备标识，如 all 或 0,1" })),
    volumes: Type.Optional(Type.Array(Type.String(), { description: "卷挂载列表，格式: 主机路径:容器路径" })),
    envVars: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "环境变量" })),
    extraArgs: Type.Optional(Type.String({ description: "额外Docker run参数" })),
  })),
});

export type VllmServerType = "local" | "remote" | "docker";

export interface VllmDockerConfig {
  enabled: boolean;
  image: string;
  containerName?: string;
  gpuDevices?: string;
  volumes?: string[];
  envVars?: Record<string, string>;
  extraArgs?: string;
}

export interface VllmServerConfig {
  type: VllmServerType;
  host?: string;
  port?: number;
  ssh?: {
    enabled: boolean;
    host: string;
    port?: number;
    username: string;
    privateKeyPath?: string;
    password?: string;
  };
  docker?: VllmDockerConfig;
}

export const VllmSubagentConfigSchema = Type.Object({
  vllmModelId: Type.String({ description: "vLLM 模型 ID，对应 vllm-models.json 中的 id" }),
  autoLoad: Type.Optional(Type.Boolean({ description: "是否在创建子智能体时自动启动 vLLM 进程" })),
  autoUnload: Type.Optional(Type.Boolean({ description: "是否在子智能体完成后自动停止 vLLM 进程" })),
  unloadDelayMs: Type.Optional(Type.Number({ description: "停止 vLLM 进程延迟（毫秒）" })),
  server: Type.Optional(VllmServerConfigSchema),
  deploymentType: Type.Optional(Type.Union([
    Type.Literal("command"),
    Type.Literal("docker")
  ], { description: "部署类型: command=命令行, docker=Docker容器" })),
});

export type VllmSubagentConfig = {
  vllmModelId: string;
  autoLoad?: boolean;
  autoUnload?: boolean;
  unloadDelayMs?: number;
  server?: VllmServerConfig;
  deploymentType?: "command" | "docker";
};

export const VllmModelListEntrySchema = Type.Object({
  id: Type.String({ description: "模型唯一标识符" }),
  name: Type.String({ description: "模型显示名称" }),
  modelPath: Type.String({ description: "模型路径：HuggingFace 模型 ID (如 qwen/Qwen2.5-7B-Instruct) 或本地绝对路径 (如 /models/llama)" }),
  baseUrl: Type.Optional(Type.String({ description: "基础 URL（可选）" })),
  server: Type.Optional(VllmServerConfigSchema),
  apiKey: Type.Optional(Type.String({ description: "API Key（可选）" })),
  gpuMemoryUtilization: Type.Optional(Type.Number({ description: "GPU 显存利用率 (0-1)，如 0.9 表示使用 90% 显存" })),
  maxModelLen: Type.Optional(Type.Number({ description: "最大模型上下文长度，如 32768" })),
  tensorParallelSize: Type.Optional(Type.Number({ description: "Tensor 并行大小，多卡推理时使用" })),
  port: Type.Optional(Type.Number({ description: "服务端口（可选，自动分配）" })),
  description: Type.Optional(Type.String({ description: "模型描述" })),
  capabilities: Type.Optional(Type.Array(Type.String(), { description: "模型能力标签" })),
  isMainAgent: Type.Optional(Type.Boolean({ description: "是否为主智能体专用模型（不会被子智能体误杀）" })),
  isSubagentOnly: Type.Optional(Type.Boolean({ description: "是否仅子智能体使用（不会被子智能体卸载）" })),
  deploymentType: Type.Optional(Type.Union([
    Type.Literal("command"),
    Type.Literal("docker")
  ], { description: "部署类型: command=命令行, docker=Docker容器" })),
});

export type VllmModelListEntry = {
  id: string;
  name: string;
  modelPath: string;
  baseUrl?: string;
  server?: VllmServerConfig;
  apiKey?: string;
  gpuMemoryUtilization?: number;
  maxModelLen?: number;
  tensorParallelSize?: number;
  port?: number;
  description?: string;
  capabilities?: string[];
  isMainAgent?: boolean;
  isSubagentOnly?: boolean;
  deploymentType?: "command" | "docker";
};

export const VLLM_MODELS_CONFIG_FILENAME = "vllm-models.json";
export const SUBAGENT_VLLM_CONFIG_FILENAME = "subagent-vllm.json";

export const MAIN_AGENT_VLLM_CONFIG_FILENAME = "main-agent-vllm.json";

export interface MainAgentVllmConfig {
  enabled: boolean;
  modelId: string;
  baseUrl: string;
  isPersistent: boolean;
}

export interface MainAgentVllmBinding {
  mainAgent: MainAgentVllmConfig;
}
