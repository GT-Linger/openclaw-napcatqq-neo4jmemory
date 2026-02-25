---
read_when:
  - 配置 Neo4j 图谱记忆系统
summary: Neo4j 图谱记忆系统说明模板
---

# Neo4j 图谱记忆系统

每次会话开始时，**必须主动获取记忆**。当配置 `plugins.slots.memory = "memory- Neo4j"` 时使用此系统。

## 什么是图谱记忆

Neo4j 图数据库以**节点**和**关系**的形式存储信息，能够捕捉实体之间的复杂关联：

```
(用户)--[喜欢]-->(编程)
(项目A)--[依赖]-->(项目B)
(张三)--[同事]-->(李四)
```

## 记忆来源

1. **图谱数据库查询**：使用 `memory_graph_search` 工具搜索
2. **今日记忆**：查询今天存储的所有记忆节点
3. **未完成任务**：查询标记为 TODO 的任务节点

## 核心工具

### 搜索记忆

```json
{
  "tool": "memory_graph_search",
  "parameters": {
    "query": "用户偏好 项目",
    "limit": 10
  }
}
```

### 添加实体

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "person",
    "name": "张三",
    "properties": {
      "role": "开发者",
      "team": "前端团队"
    }
  }
}
```

### 添加关系

```json
{
  "tool": "memory_relation_add",
  "parameters": {
    "fromEntity": "张三",
    "toEntity": "李四",
    "relationType": "同事"
  }
}
```

### 标记 TODO

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "todo",
    "name": "完成项目报告",
    "properties": {
      "status": "pending",
      "dueDate": "2024-01-20"
    }
  }
}
```

## 读取规则（每次会话必须执行）

1. **使用 `memory_graph_search` 搜索**：输入与当前任务相关的关键词
2. **搜索范围**：今天 + 昨天的记忆
3. **特别关注 TODO 节点**：查询状态为 pending 的任务
4. 如果没有找到相关信息，说明图谱中暂无记忆

**重要**：你不会自动获得这些记忆内容——必须主动搜索！

## 写入规则

### 什么时候写入

- 用户告诉你重要的事情（偏好、习惯、信息）
- 你做出了重要决定
- 有未完成的任务（TODO）
- 用户要求你记住某些内容
- 会话结束前，总结关键信息到图谱

### 实体类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `person` | 人物 | 用户、朋友、同事 |
| `project` | 项目 | 产品、开发任务 |
| `task` | 任务 | 待办事项、项目任务 |
| `todo` | 待办 | 需要完成的事项 |
| `knowledge` | 知识 | 事实、信息 |
| `preference` | 偏好 | 用户偏好设置 |
| `conversation` | 对话 | 对话记录摘要 |
| `event` | 事件 | 会议、约定 |

### 关系类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `knows` | 认识 | 人物之间的关系 |
| `同事` | 工作关系 | 同事关系 |
| `喜欢` | 偏好 | 用户喜欢什么 |
| `属于` | 归属 | 属于哪个团队 |
| `依赖` | 依赖关系 | 项目之间的依赖 |
| `包含` | 包含关系 | 对话包含哪些主题 |
| `created` | 创建 | 谁创建了某个任务 |

### 写入示例

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "preference",
    "name": "用户偏好",
    "properties": {
      "key": "answerStyle",
      "value": "简洁",
      "reason": "用户喜欢简洁的回答"
    }
  }
}
```

```json
{
  "tool": "memory_relation_add",
  "parameters": {
    "fromEntity": "用户",
    "toEntity": "Python",
    "relationType": "喜欢",
    "properties": {
      "confidence": 0.9
    }
  }
}
```

## 图谱结构示例

```cypher
// 人物节点
CREATE (p:Person {name: '张三', role: '开发者'})
CREATE (p2:Person {name: '李四', role: '设计师'})

// 关系
CREATE (p)-[:同事]->(p2)

// TODO 节点
CREATE (t:Todo {
  content: '完成项目报告',
  status: 'pending',
  createdAt: '2024-01-15',
  dueDate: '2024-01-20'
})

// 知识节点
CREATE (k:Knowledge {
  topic: '用户偏好',
  content: '用户喜欢简洁的回答',
  importance: 0.8
})
```

## 图谱记忆的优势

- **关系感知**：能够理解实体之间的复杂关系
- **多跳搜索**：可以查找"朋友的朋友"这类信息
- **结构化**：便于进行复杂查询
- **高效检索**：大规模数据下仍能快速搜索
- **自动提取**：可以从对话中自动提取实体和关系

## 搜索技巧

### 基本搜索

```
用户 偏好
项目 进度
今天 会议
```

### 高级查询

- 按时间范围搜索：`最近一周的记忆`
- 按实体类型搜索：`所有 TODO 任务`
- 按关系搜索：`张三的所有同事`

## 注意事项

1. **主动搜索**：会话开始时必须搜索相关记忆
2. **主动记录**：发现重要信息立即存入图谱
3. **关系建立**：不仅记录实体，还要建立关系
4. **定期清理**：清理过时的 TODO 和无用信息
5. **敏感信息**：避免存储密钥、密码等敏感信息
