# OpenClaw-NapCatQQ-Neo4jMemory

<p align="center">
  <strong>多通道 AI 网关 · 子智能体系统 · QQ 消息通道 · Neo4j 图谱记忆</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow_status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

---

## 项目简介

本项目是 [OpenClaw](https://github.com/openclaw/openclaw) 的增强版本，在原有强大的多通道 AI 网关基础上，新增了以下核心功能：

| 功能 | 说明 |
|------|------|
| [子智能体系统](#子智能体系统) | 用不同的模型执行不同的任务，支持并行处理 |
| [vLLM/SGLang 部署](#vllmsglang-模型管理) | 本地/远程高性能推理服务管理 |
| [SSH 远程服务器管理](#ssh-远程服务器管理) | 管理模型的动态加载与卸载，检查显存内存占用 |
| [任务上下文持久化](#任务上下文持久化) | 主智能体分配任务，子智能体协作完成 |
| [内存架构自动检测](#内存架构自动检测) | 防止统一架构内存因模型占用过大导致系统卡死 |
| [NapCatQQ 通道](#napcatqq-消息通道) | QQ 消息通道，通过 OneBot 11 协议连接 |
| [Neo4j 图谱记忆](#neo4j-图谱记忆系统) | 智能记忆管理，支持实体关系提取与多跳搜索 |
| [Ollama 配置引导](#ollama-配置引导) | 在 onboard 流程中直接配置 Ollama |

---

## 核心特性

### 子智能体系统

主智能体的"助手"，可以并行处理多个独立任务。每个子智能体可以使用不同的模型，拥有独立的工作目录和人格设定。

```
┌─────────────────────────────────────────────────────────────┐
│                      主智能体 (Main Agent)                   │
│                    任务分配 · 结果汇总 · 协调                │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  代码助手      │   │  数学助手      │   │  写作助手      │
│ DeepSeek-Coder│   │ DeepSeek-Math │   │  Qwen-Writer  │
│   (vLLM)      │   │   (vLLM)      │   │  (Ollama)     │
└───────────────┘   └───────────────┘   └───────────────┘
```

**核心能力：**

- **并行任务执行** - 多个子智能体同时处理独立任务
- **模型隔离** - 每个子智能体使用专用模型，任务完成后自动释放资源
- **任务上下文传递** - 子智能体了解任务全貌，多智能体协作时稳定传输上下文
- **人格定制** - 每个子智能体拥有独立的人格设定、工具使用规范和行为配置

**配置示例：**

```json
{
  "id": "code-assistant",
  "name": "代码助手",
  "description": "帮我写代码、调试bug",
  "model": {
    "endpoint": {
      "provider": "vllm",
      "baseUrl": "http://192.168.1.100:8001",
      "model": "deepseek-coder-6.7b-instruct"
    }
  },
  "behavior": {
    "autoStartModel": true,
    "autoStopModel": true,
    "timeout": 600000
  }
}
```

**使用方式：**

```json
{
  "tool": "sessions_spawn",
  "parameters": {
    "task": "分析今天的销售数据",
    "label": "销售数据分析",
    "subagentId": "code-assistant"
  }
}
```

---

### vLLM/SGLang 模型管理

统一管理 vLLM 和 SGLang 推理服务，支持本地和远程部署：

**支持的功能：**

| 功能 | 描述 |
|------|------|
| 模型动态加载 | 按需启动模型服务 |
| 自动资源释放 | 子智能体任务完成后自动停止模型 |
| 健康检查 | 自动检测服务状态 |
| 端口自动分配 | 避免端口冲突 |
| GPU 显存管理 | 可配置 GPU 显存利用率 |

**模型配置示例：**

```json
[
  {
    "id": "qwen-main",
    "name": "Qwen 主智能体模型",
    "modelPath": "qwen/Qwen2.5-7B-Instruct",
    "server": {
      "type": "remote",
      "host": "192.168.1.100",
      "port": 8000,
      "ssh": {
        "enabled": true,
        "host": "192.168.1.100",
        "username": "gpuuser",
        "privateKeyPath": "~/.ssh/id_rsa"
      }
    },
    "isMainAgent": true
  },
  {
    "id": "deepseek-coder",
    "name": "DeepSeek Coder",
    "modelPath": "/models/deepseek-coder-6.7b-instruct",
    "server": {
      "type": "remote",
      "host": "192.168.1.100",
      "port": 8001
    },
    "isSubagentOnly": true
  }
]
```

---

### SSH 远程服务器管理

通过 SSH 管理远程 GPU 服务器上的模型服务：

**功能支持：**

- 远程启动/停止 vLLM/SGLang 服务
- 检查远程服务器显存、内存占用情况
- 支持私钥认证
- 自动重连机制

**命令行操作：**

```bash
openclaw subagent vllm list              # 列出模型配置
openclaw subagent vllm start <model-id>  # 启动模型
openclaw subagent vllm stop <model-id>   # 停止模型
openclaw subagent vllm status            # 查看运行状态
openclaw subagent vllm ssh-status        # 检查远程服务器状态
```

---

### 任务上下文持久化

主智能体分配任务后，子智能体能够了解任务全貌并完成自己的部分：

**工作流程：**

1. **任务发布** - 主智能体公布任务具体内容
2. **任务分配** - 安排子智能体执行内容
3. **上下文传递** - 子智能体了解任务全貌
4. **协作执行** - 多个子智能体合作时，稳定传输上下文内容
5. **结果汇总** - 主智能体收集并整合结果

**上下文结构：**

```typescript
interface TaskContext {
  taskId: string;
  originalRequest: string;      // 原始请求
  subagentTasks: SubagentTask[]; // 子任务列表
  sharedResults: Map<string, any>; // 共享结果
  status: "pending" | "running" | "completed" | "failed";
}
```

---

### 内存架构自动检测

自动检测系统内存架构，防止模型占用过大导致系统卡死：

**支持的架构：**

| 架构 | 描述 | 默认内存上限 |
|------|------|-------------|
| `LOCAL_GPU` | 本地 NVIDIA GPU | 85% |
| `UNIFIED_MEMORY` | Apple Silicon 统一内存 | 70% |
| `REMOTE_GPU` | 远程 GPU 服务器 | 80% |

**自动检测逻辑：**

- macOS Apple Silicon → 统一内存架构，保留 20% 系统内存
- Linux/Windows + NVIDIA GPU → 本地 GPU 架构
- 配置了远程服务器 → 远程 GPU 架构

---

### NapCatQQ 消息通道

通过 [NapCatQQ](https://github.com/NapNeko/NapCatQQ) 实现 QQ 平台的消息收发，采用 OneBot 11 协议：

```
┌─────────────────┐         反向 WebSocket          ┌─────────────────┐
│                 │ ◄────────────────────────────── │                 │
│    OpenClaw     │                                 │    NapCatQQ     │
│  (WS 服务器)    │ ──────────────────────────────► │  (WS 客户端)    │
│                 │         API 调用/事件          │                 │
└─────────────────┘                                 └─────────────────┘
     :3001                                                QQ 协议
```

**功能支持：**

- 私聊消息收发
- 群聊消息收发
- 媒体文件支持
- 消息流式传输
- 自动重连机制
- 访问令牌认证
- 私信配对安全机制
- 群消息白名单控制

**配置示例：**

```json
{
  "channels": {
    "napcatqq": {
      "wsPort": 3001,
      "wsHost": "127.0.0.1",
      "wsPath": "/onebot/v11/ws",
      "accessToken": "your-secure-token",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["123456789"]
    }
  }
}
```

---

### Neo4j 图谱记忆系统

基于 Neo4j 图数据库的智能记忆系统，提供结构化的知识存储和检索能力：

**核心能力：**

| 功能 | 描述 |
|------|------|
| 实体管理 | 存储和检索实体（人物、项目、事件等） |
| 关系追踪 | 捕获和查询实体之间的关系 |
| 多跳搜索 | 遍历图谱查找关联信息 |
| 自动提取 | 从对话中自动提取实体和关系 |
| 上下文注入 | 在 AI 响应前自动召回相关记忆 |

**支持的实体类型：**

`Person` · `Project` · `Event` · `Place` · `Organization` · `Topic` · `Concept` · `Preference` · `Decision` · `Goal` · `Fact` · `Skill` · `Character` · `Plot` · `Item` · `Date`

**支持的关系类型：**

`KNOWS` · `LOCATED_AT` · `HAPPENED_ON` · `PARTICIPATED_IN` · `PREFERS` · `DECIDED` · `RELATED_TO` · `WORKS_ON` · `HAS_SKILL` · `DEPENDS_ON` · `CONTRADICTS` · `BELONGS_TO` · `PART_OF` · `CAUSES` · `FOLLOWS` 等

**配置示例：**

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-neo4j"
    },
    "entries": {
      "memory-neo4j": {
        "enabled": true,
        "connection": {
          "uri": "bolt://localhost:7687",
          "username": "neo4j",
          "password": "your-password"
        },
        "lifecycle": {
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

---

### Ollama 配置引导

在 `openclaw onboard` 命令中直接配置 Ollama 作为本地 LLM 提供商：

```bash
openclaw onboard
# 选择 Ollama 作为本地 LLM 提供商
# 自动检测 Ollama 服务状态
# 配置模型和端点
```

---

## 快速开始

### 环境要求

- Node.js ≥ 22.12.0
- pnpm 10.23.0
- Neo4j 5.x（用于图谱记忆）
- vLLM 或 SGLang（可选，用于本地模型推理）

### 安装

```bash
git clone https://github.com/your-username/openclaw-napcatqq-neo4jmemory.git
cd openclaw-napcatqq-neo4jmemory
pnpm install
pnpm build
```

### 配置引导

```bash
pnpm openclaw onboard
```

引导流程支持：
- 配置主智能体模型（OpenAI/Anthropic/Ollama/vLLM/SGLang）
- 配置子智能体
- 配置消息通道
- 配置记忆系统

### 启动服务

```bash
pnpm openclaw gateway run
```

---

## 项目结构

```
openclaw-napcatqq-neo4jmemory/
├── agents/default/              # 智能体配置模板
│   ├── main-agent-vllm.json.example
│   ├── subagent-vllm.json.example
│   └── vllm-models.json.example
│
├── extensions/
│   ├── napcatqq/                # QQ 消息通道插件
│   ├── memory-neo4j/            # Neo4j 图谱记忆插件
│   └── ...其他扩展插件
│
├── src/agents/                  # 智能体核心
│   ├── subagent-manager.ts      # 子智能体管理
│   ├── subagent-task-context.ts # 任务上下文持久化
│   ├── subagent-concurrency.ts  # 并发控制与内存检测
│   ├── vllm-manager.ts          # vLLM 服务管理
│   ├── sglang-manager.ts        # SGLang 服务管理
│   ├── model-manager.ts         # 统一模型管理
│   └── model-service-integration.ts
│
├── src/commands/
│   ├── configure.subagent.ts    # 子智能体配置引导
│   └── ollama-setup.ts          # Ollama 配置
│
└── docs/
    └── reference/templates/     # 配置模板文档
        ├── features/subagent.md
        ├── memory/graph-memory.md
        └── platform/qq.md
```

---

## 支持的消息通道

| 通道 | 类型 | 状态 |
|------|------|------|
| QQ (NapCatQQ) | 扩展插件 | 新增 |
| WhatsApp | 内置 | 支持 |
| Telegram | 内置 | 支持 |
| Discord | 内置 | 支持 |
| Slack | 内置 | 支持 |
| Signal | 内置 | 支持 |
| Matrix | 扩展插件 | 支持 |
| iMessage/BlueBubbles | 扩展插件 | 支持 |
| Microsoft Teams | 扩展插件 | 支持 |
| Zalo | 扩展插件 | 支持 |
| Feishu | 扩展插件 | 支持 |
| Line | 扩展插件 | 支持 |

---

## 开发命令

```bash
pnpm install          # 安装依赖
pnpm build            # 构建项目
pnpm dev              # 开发模式
pnpm test             # 运行测试
pnpm lint             # 代码检查
pnpm format           # 格式化代码
```

---

## 安全特性

### NapCatQQ 安全默认设置

- **私信配对** (`dmPolicy="pairing"`): 未知发送者收到配对码，需手动批准
- **群消息白名单** (`groupPolicy="allowlist"`): 仅处理白名单群组的消息
- **访问令牌**: WebSocket 连接需要令牌认证

### 命令行管理

```bash
openclaw pairing approve napcatqq <code>  # 批准配对请求
openclaw status --deep                    # 查看状态
openclaw subagent list                    # 列出子智能体
openclaw subagent vllm status             # 查看模型状态
```

---

## 许可证

[MIT License](LICENSE)

---

## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 原始项目
- [NapCatQQ](https://github.com/NapNeko/NapCatQQ) - QQ 协议实现
- [Neo4j](https://neo4j.com/) - 图数据库
- [vLLM](https://github.com/vllm-project/vllm) - 高性能 LLM 推理
- [SGLang](https://github.com/sgl-project/sglang) - 快速 LLM 推理引擎
- [OneBot](https://github.com/botuniverse/onebot) - 机器人协议标准
