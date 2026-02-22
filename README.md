# 🦞 OpenClaw-NapCatQQ-Neo4jMemory

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="500">
    </picture>
</p>

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow_status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  <strong>🚀 基于 OpenClaw 的增强版本，新增 QQ 消息通道和 Neo4j 图谱记忆系统</strong>
</p>

---

## 📖 项目简介

本项目是 [OpenClaw](https://github.com/openclaw/openclaw) 的增强分支，在原有强大的多通道 AI 助手基础上，新增了两个重要特性：

| 特性 | 描述 |
|------|------|
| 🐧 **NapCatQQ 消息通道** | 通过 OneBot 11 协议连接 QQ 平台，支持私聊和群聊 |
| 🧠 **Neo4j 图谱记忆系统** | 基于图数据库的智能记忆管理，支持实体关系提取和多跳搜索 |

---

## ✨ 核心功能

### 🐧 NapCatQQ 消息通道

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

**功能特性：**
- ✅ 私聊消息收发
- ✅ 群聊消息收发
- ✅ 媒体文件支持
- ✅ 消息流式传输
- ✅ 自动重连机制
- ✅ 访问令牌认证
- ✅ 私信配对安全机制
- ✅ 群消息白名单控制

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
      "groups": ["123456789"]
    }
  }
}
```

---

### 🧠 Neo4j 图谱记忆系统

基于 Neo4j 图数据库的智能记忆系统，提供结构化的知识存储和检索能力：

**核心能力：**

| 功能 | 描述 |
|------|------|
| **实体管理** | 存储和检索实体（人物、项目、事件等） |
| **关系追踪** | 捕获和查询实体之间的关系 |
| **多跳搜索** | 遍历图谱查找关联信息 |
| **自动提取** | 从对话中自动提取实体和关系 |
| **上下文注入** | 在 AI 响应前自动召回相关记忆 |
| **记忆衰减** | 可配置的遗忘机制，淘汰过时信息 |

**支持的实体类型：**

- 👤 `Person` - 人物
- 📁 `Project` - 项目
- 📅 `Event` - 事件
- 📍 `Location` - 地点
- 💼 `Organization` - 组织
- 📝 `Topic` - 主题
- 🗂️ `Concept` - 概念
- 📊 `Preference` - 偏好

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
          "password": "your-password",
          "database": "neo4j"
        },
        "models": {
          "strategy": "hybrid",
          "extraction": {
            "quick": {
              "enabled": true,
              "model": "gpt-4o-mini"
            },
            "deep": {
              "enabled": true,
              "useMainModel": true
            }
          }
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

**提供的工具：**

| 工具名称 | 功能 |
|----------|------|
| `memory_entity_add` | 添加新实体到图谱 |
| `memory_relation_add` | 添加实体间关系 |
| `memory_graph_search` | 多跳图谱搜索 |

---

## 🚀 快速开始

### 环境要求

- **Node.js**: ≥ 22
- **pnpm**: 推荐
- **Neo4j**: 5.x 版本（用于图谱记忆）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/your-username/openclaw-napcatqq-neo4jmemory.git
cd openclaw-napcatqq-neo4jmemory

# 安装依赖
pnpm install

# 构建项目
pnpm build

# 运行入门向导
pnpm openclaw onboard --install-daemon
```

### 启动 Neo4j

```bash
# 使用 Docker 启动 Neo4j
docker run -d \
  --name neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your-password \
  neo4j:latest
```

### 配置 NapCatQQ

1. 安装并配置 [NapCatQQ](https://github.com/NapNeko/NapCatQQ)
2. 在 NapCatQQ 配置中启用反向 WebSocket：

```json
{
  "reverseWs": {
    "enable": true,
    "urls": ["ws://127.0.0.1:3001/onebot/v11/ws"]
  },
  "accessToken": "your-secure-token"
}
```

3. 启动 Gateway：

```bash
openclaw gateway run
```

---

## 📋 完整配置示例

```json
{
  "gateway": {
    "port": 18789,
    "bind": "loopback"
  },
  "channels": {
    "napcatqq": {
      "wsPort": 3001,
      "wsHost": "127.0.0.1",
      "wsPath": "/onebot/v11/ws",
      "accessToken": "your-secure-token",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "groups": ["123456789", "987654321"],
      "reconnect": {
        "enabled": true,
        "maxRetries": 10,
        "retryDelay": 5000,
        "backoffMultiplier": 2,
        "maxDelay": 60000
      }
    }
  },
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
          "password": "your-password",
          "database": "neo4j"
        },
        "extraction": {
          "mode": "hybrid",
          "minConfidence": 0.6
        },
        "lifecycle": {
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-20250514",
      "workspace": "~/.openclaw/workspace"
    }
  }
}
```

---

## 🔧 支持的消息通道

| 通道 | 类型 | 状态 |
|------|------|------|
| 🐧 **QQ (NapCatQQ)** | 扩展插件 | ✅ **新增** |
| 📱 WhatsApp | 内置 | ✅ |
| 📨 Telegram | 内置 | ✅ |
| 💬 Discord | 内置 | ✅ |
| 🏢 Slack | 内置 | ✅ |
| 📧 Google Chat | 内置 | ✅ |
| 🔐 Signal | 内置 | ✅ |
| 🍎 iMessage/BlueBubbles | 扩展插件 | ✅ |
| 🏢 Microsoft Teams | 扩展插件 | ✅ |
| 🌐 Matrix | 扩展插件 | ✅ |
| 🇻🇳 Zalo | 扩展插件 | ✅ |
| 🌐 WebChat | 内置 | ✅ |

---

## 🏗️ 项目架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           消息通道层                                      │
│  WhatsApp │ Telegram │ Discord │ Slack │ QQ(NapCatQQ) │ Signal │ ...   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Gateway (控制平面)                                 │
│                    ws://127.0.0.1:18789                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  会话管理   │ │  配置管理   │ │  工具调用   │ │  事件分发   │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Pi Agent    │      │ Neo4j Memory  │      │  其他工具     │
│   (AI 核心)   │      │  (图谱记忆)   │      │  浏览器/画布  │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## 📁 项目结构

```
openclaw-napcatqq-neo4jmemory/
├── extensions/
│   ├── napcatqq/              # QQ 消息通道插件
│   │   ├── src/
│   │   │   ├── channel.ts     # 通道实现
│   │   │   ├── websocket.ts   # WebSocket 连接
│   │   │   ├── monitor.ts     # 消息监控
│   │   │   ├── onboarding.ts  # 入门引导
│   │   │   └── ...
│   │   └── openclaw.plugin.json
│   │
│   ├── memory-neo4j/          # Neo4j 图谱记忆插件
│   │   ├── db/
│   │   │   ├── connection.ts  # 数据库连接
│   │   │   └── store.ts       # 数据存储
│   │   ├── entities/
│   │   │   ├── extractor.ts   # 实体提取
│   │   │   └── context-manager.ts
│   │   ├── relations/
│   │   │   └── extractor.ts   # 关系提取
│   │   ├── tools/
│   │   │   ├── memory-entity-add.ts
│   │   │   ├── memory-relation-add.ts
│   │   │   └── memory-graph-search.ts
│   │   └── openclaw.plugin.json
│   │
│   └── ...其他扩展插件
│
├── src/                       # 核心源码
│   ├── gateway/               # Gateway 服务器
│   ├── agents/                # AI 代理运行时
│   ├── memory/                # 原生记忆系统
│   ├── channels/              # 通道核心
│   ├── cli/                   # 命令行界面
│   └── ...
│
├── docs/                      # 文档
│   ├── channels/
│   │   └── napcatqq.md        # NapCatQQ 文档
│   └── plugins/
│       └── memory-neo4j.md    # Neo4j 记忆文档
│
└── locales/                   # 国际化
    └── cli/
        ├── en.json
        └── zh-CN.json
```

---

## 🔒 安全特性

### NapCatQQ 安全默认设置

- **私信配对** (`dmPolicy="pairing"`): 未知发送者收到配对码，需手动批准
- **群消息白名单** (`groupPolicy="allowlist"`): 仅处理白名单群组的消息
- **访问令牌**: WebSocket 连接需要令牌认证

### 命令行管理

```bash
# 批准配对请求
openclaw pairing approve napcatqq <code>

# 查看状态
openclaw status --deep

# 安全审计
openclaw security audit
```

---

## 📚 文档资源

- [NapCatQQ 配置指南](docs/channels/napcatqq.md)
- [Neo4j 记忆系统文档](docs/plugins/memory-neo4j.md)
- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [NapCatQQ 项目](https://github.com/NapNeko/NapCatQQ)
- [Neo4j 官方文档](https://neo4j.com/docs/)

---

## 🛠️ 开发命令

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式（自动重载）
pnpm gateway:watch

# 类型检查
pnpm tsgo

# 代码检查
pnpm lint

# 运行测试
pnpm test

# 格式化代码
pnpm format
```

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 原始项目
- [NapCatQQ](https://github.com/NapNeko/NapCatQQ) - QQ 协议实现
- [Neo4j](https://neo4j.com/) - 图数据库
- [OneBot](https://github.com/botuniverse/onebot) - 机器人协议标准

---

<p align="center">
  <strong>Made with ❤️ by OpenClaw Community</strong>
</p>
