---
title: "Neo4j 记忆插件"
summary: "基于图谱的记忆系统，支持实体关系提取和多跳搜索"
read_when:
  - 你想要配置 Neo4j 图谱记忆
  - 你需要实体提取和关系推理
  - 你想要多跳图谱搜索能力
---

# Neo4j 记忆插件

Neo4j 记忆插件为 OpenClaw 提供了**基于图谱的记忆系统**，通过知识图谱实现对实体、关系和上下文信息的智能存储与检索。

## 功能特性

- **实体管理**：存储和检索实体（人物、项目、事件等）
- **关系追踪**：捕获和查询实体之间的关系
- **多跳搜索**：遍历图谱查找关联信息
- **自动提取**：自动从对话中提取实体和关系
- **上下文注入**：在 AI 响应前自动召回相关记忆
- **记忆衰减**：可配置的遗忘机制，清理过时信息

## 安装

### 前置条件

1. **Neo4j 数据库**：安装并运行 Neo4j（推荐 5.x 版本）
   - Docker 方式：`docker run -p 7474:7474 -p 7687:7687 neo4j:latest`
   - 本地安装：从 [neo4j.com](https://neo4j.com/download/) 下载
   - 云服务：使用 [Neo4j Aura](https://neo4j.com/aura/) 托管服务

2. **安装依赖**：
   ```bash
   pnpm install
   ```

### 启用插件

在 OpenClaw 配置中添加：

```json5
{
  plugins: {
    slots: {
      memory: "memory-neo4j"
    },
    entries: {
      "memory-neo4j": {
        enabled: true
      }
    }
  }
}
```

## 配置

### 基础配置

```json5
{
  plugins: {
    entries: {
      "memory-neo4j": {
        enabled: true,
        connection: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "your-password",
          database: "neo4j"
        }
      }
    }
  }
}
```

### 完整配置参考

```json5
{
  plugins: {
    entries: {
      "memory-neo4j": {
        enabled: true,

        // Neo4j 连接设置
        connection: {
          uri: "bolt://localhost:7687",      // Neo4j bolt URI
          username: "neo4j",                  // 数据库用户名
          password: "your-password",          // 数据库密码（必填）
          database: "neo4j"                   // 数据库名称
        },

        // 提取模型配置
        models: {
          strategy: "hybrid",                 // "same-as-main" | "independent" | "hybrid"

          extraction: {
            // 快速提取（轻量级）
            quick: {
              enabled: true,
              provider: "openai",
              model: "gpt-4o-mini"
            },

            // 深度提取（使用主模型）
            deep: {
              enabled: true,
              useMainModel: true
            }
          }
        },

        // 提取设置
        extraction: {
          mode: "hybrid",                     // "auto" | "manual" | "hybrid"
          minConfidence: 0.6                  // 最小置信度阈值
        },

        // 生命周期钩子
        lifecycle: {
          autoCapture: true,                  // 自动从对话中提取
          autoRecall: true                    // 自动注入相关记忆
        }
      }
    }
  }
}
```

### 配置选项说明

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用插件 |
| `connection.uri` | string | `bolt://localhost:7687` | Neo4j 连接 URI |
| `connection.username` | string | `neo4j` | 数据库用户名 |
| `connection.password` | string | *必填* | 数据库密码 |
| `connection.database` | string | `neo4j` | 数据库名称 |
| `models.strategy` | string | `hybrid` | 模型选择策略 |
| `extraction.mode` | string | `hybrid` | 提取模式 |
| `extraction.minConfidence` | number | `0.6` | 提取的最小置信度 |
| `lifecycle.autoCapture` | boolean | `true` | 自动从对话中提取实体 |
| `lifecycle.autoRecall` | boolean | `true` | 自动注入记忆到上下文 |

## 实体类型

插件支持以下实体类型：

| 类型 | 描述 | 示例 |
|------|------|------|
| `Person` | 人物 | "张三", "Alice" |
| `Project` | 项目和工作项 | "小说《潜伏》", "网站重构" |
| `Character` | 虚构角色 | "李四", "Harry Potter" |
| `Event` | 事件 | "项目启动会", "生日派对" |
| `Place` | 地点 | "北京", "办公室" |
| `Fact` | 事实信息 | "公司成立于2020年" |
| `Decision` | 决策 | "决定使用React框架" |
| `Preference` | 用户偏好 | "喜欢简洁的设计风格" |
| `Goal` | 目标 | "完成第一章" |
| `Topic` | 讨论主题 | "人工智能", "市场营销" |

## 关系类型

| 类型 | 描述 | 示例 |
|------|------|------|
| `KNOWS` | 人物认识人物 | Alice KNOWS Bob |
| `BELONGS_TO` | 实体属于项目 | 任务 BELONGS_TO 项目 |
| `PARTICIPATED_IN` | 人物参与事件 | 张三 PARTICIPATED_IN 会议 |
| `PREFERS` | 人物偏好 | 张三 PREFERS 深色模式 |
| `DECIDED` | 人物做出决策 | 团队 DECIDED 使用 React |
| `RELATED_TO` | 一般关系 | 主题A RELATED_TO 主题B |
| `CHARACTER_OF` | 角色属于作品 | 李四 CHARACTER_OF 小说《潜伏》 |
| `AUTHOR_OF` | 作者关系 | 张三 AUTHOR_OF 小说《潜伏》 |
| `MENTIONED_IN` | 实体被提及于 | 主题 MENTIONED_IN 会议 |
| `HAPPENS_IN` | 事件发生在地点 | 会议 HAPPENS_IN 办公室 |

## 工具

### memory_graph_search

在知识图谱中搜索实体及其关系。

**参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `query` | string | 是 | 搜索查询（实体名称、概念或自然语言） |
| `entityType` | string | 否 | 按实体类型过滤 |
| `maxHops` | number | 否 | 最大关系跳数（默认：3） |
| `maxResults` | number | 否 | 最大结果数（默认：20） |
| `includeRelations` | boolean | 否 | 包含关联实体 |
| `minConfidence` | number | 否 | 最小置信度（默认：0.5） |
| `projectId` | string | 否 | 项目上下文过滤 |

**示例：**

```json
{
  "query": "张三",
  "maxHops": 2,
  "includeRelations": true
}
```

### memory_entity_add

向知识图谱添加新实体。

**参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `type` | string | 是 | 实体类型 |
| `name` | string | 是 | 实体名称 |
| `content` | string | 否 | 实体描述 |
| `aliases` | string[] | 否 | 别名列表 |
| `attributes` | object | 否 | 自定义属性 |
| `confidence` | number | 否 | 置信度（默认：0.8） |
| `projectId` | string | 否 | 关联项目 |

**示例：**

```json
{
  "type": "Person",
  "name": "张三",
  "content": "软件工程师，擅长Python和JavaScript",
  "aliases": ["小张", "Zhang San"],
  "attributes": {
    "age": 30,
    "department": "研发部"
  }
}
```

### memory_relation_add

在两个实体之间创建关系。

**参数：**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `fromEntity` | string | 是 | 源实体名称或ID |
| `toEntity` | string | 是 | 目标实体名称或ID |
| `relationType` | string | 是 | 关系类型 |
| `context` | string | 否 | 关系上下文 |
| `confidence` | number | 否 | 置信度（默认：0.7） |

**示例：**

```json
{
  "fromEntity": "张三",
  "toEntity": "项目A",
  "relationType": "PARTICIPATED_IN",
  "context": "担任技术负责人",
  "confidence": 0.9
}
```

## CLI 命令

插件提供以下 CLI 命令用于记忆管理：

```bash
# 查看记忆状态
openclaw memory-graph status

# 搜索图谱
openclaw memory-graph search "张三" --relations

# 添加实体
openclaw memory-graph entity add Person "李四" --content "产品经理"

# 添加关系
openclaw memory-graph relation add "张三" "李四" KNOWS

# 可视化图谱（输出 DOT 格式）
openclaw memory-graph visualize --output graph.dot

# 清理旧记忆
openclaw memory-graph cleanup --max-age 365

# 导出图谱数据
openclaw memory-graph export --format json --output backup.json
```

## 使用示例

### 示例 1：项目上下文追踪

```
用户：我在写一本小说，名字叫《潜伏》，主角叫李四。

AI: [自动提取]
- 创建实体：Project "小说《潜伏》"
- 创建实体：Character "李四"
- 创建关系：李四 CHARACTER_OF 小说《潜伏》
```

```
用户：李四获取了一份重要的情报。

AI: [上下文关联]
- 识别 "李四" 为已知角色
- 创建实体：Event "获取情报"
- 创建关系：李四 PARTICIPATED_IN 获取情报
- 创建关系：获取情报 BELONGS_TO 小说《潜伏》
```

### 示例 2：多跳搜索

```
用户：张三认识哪些人？

AI: [执行图谱搜索]
1. [Person] 张三
   关系路径：张三 -[KNOWS]-> 李四, 张三 -[WORKS_WITH]-> 王五
   相关实体：李四, 王五

张三认识李四和王五。
```

### 示例 3：偏好追踪

```
用户：我喜欢简洁的设计风格，不喜欢花哨的界面。

AI: [自动捕获]
- 创建实体：Preference "简洁的设计风格"
- 创建关系：User PREFERS 简洁的设计风格
```

## 记忆生命周期

### 自动捕获

当启用 `lifecycle.autoCapture` 时，插件会自动从对话中提取实体和关系：

1. 监听 `agent_end` 事件
2. 从对话中提取用户消息
3. 运行实体和关系提取
4. 将结果存储到图谱中

### 自动召回

当启用 `lifecycle.autoRecall` 时，相关记忆会在 AI 响应前被注入：

1. 监听 `before_agent_start` 事件
2. 在图谱中搜索与提示词匹配的实体
3. 将找到的实体作为上下文注入

### 记忆衰减

插件支持自动记忆清理：

- **衰减**：置信度随时间降低，基于 `halfLife` 设置
- **清理**：定期移除低置信度或过时的记忆
- **归档**：可选的旧记忆归档功能

```json5
{
  plugins: {
    entries: {
      "memory-neo4j": {
        forgetting: {
          decay: {
            enabled: true,
            halfLife: 2592000000,    // 30天（毫秒）
            minConfidence: 0.3
          },
          cleanup: {
            enabled: true,
            interval: 86400000,      // 每日清理
            maxAge: 31536000000      // 1年（毫秒）
          }
        }
      }
    }
  }
}
```

## 冲突解决

当检测到冲突信息时，插件使用可配置的策略：

| 策略 | 描述 |
|------|------|
| `confidence-based` | 保留高置信度信息 |
| `newest-wins` | 保留最新信息 |
| `ask-user` | 提示用户解决 |

```json5
{
  conflictResolution: "confidence-based"
}
```

## 安全注意事项

1. **密码保护**：永远不要将 Neo4j 密码提交到版本控制
2. **网络安全**：远程 Neo4j 连接应使用 TLS
3. **访问控制**：适当配置 Neo4j 用户角色
4. **数据隐私**：注意对话内容可能被存储在图谱中

## 故障排除

### 连接问题

```
错误：无法连接到 Neo4j
```

- 验证 Neo4j 是否运行：`docker ps` 或检查 Neo4j Desktop
- 检查连接 URI 和凭据
- 确保网络连通性

### 记忆未被捕获

- 检查 `lifecycle.autoCapture` 是否启用
- 验证提取模型是否配置
- 查看日志中的提取错误

### 搜索无结果

- 验证数据库中是否存在实体
- 检查 `minConfidence` 阈值
- 确保正确的实体类型过滤

## 从其他记忆系统迁移

从默认记忆系统迁移：

1. 导出现有记忆
2. 转换为图谱格式
3. 使用 CLI 或 API 导入

```bash
# 从默认记忆导出
openclaw memory export --format json > memories.json

# 导入到 Neo4j（需要自定义脚本）
node scripts/migrate-to-neo4j.js memories.json
```

## 性能调优

### 索引

Neo4j 会自动为常见查询创建索引。对于大型数据集，建议：

```cypher
CREATE INDEX entity_name IF NOT EXISTS FOR (n:Entity) ON (n.name);
CREATE INDEX entity_type IF NOT EXISTS FOR (n:Entity) ON (n.type);
```

### 查询优化

- 使用 `maxHops` 限制遍历深度
- 设置适当的 `maxResults` 避免大结果集
- 使用 `entityType` 过滤缩小搜索范围

### 缓存

插件支持缓存频繁访问的实体：

```json5
{
  performance: {
    cacheEnabled: true,
    cacheTTL: 3600000,      // 1小时
    cacheMaxSize: 1000
  }
}
```

## API 参考

如需编程访问，请使用导出的类：

```typescript
import {
  Neo4jConnection,
  GraphStore,
  SessionContextManager,
  EntityExtractor,
  RelationExtractor
} from "@openclaw/memory-neo4j";
```

## 相关文档

- [记忆概念](/zh-CN/concepts/memory) - 通用记忆系统概述
- [插件开发](/zh-CN/tools/plugin) - 构建 OpenClaw 插件
- [Neo4j 文档](https://neo4j.com/docs/) - 官方 Neo4j 文档
