---
read_when:
  - 创建子智能体
summary: 子智能体工具使用规范模板
---

# 子智能体工具使用规范

## 概述

作为子智能体，你可以通过 **Skills** 与外部世界交互。Skills 是封装好的工具集，每个 Skill 包含具体的使用说明。

## Skills 使用原则

### 1. 自主选择

- 根据任务需要自主判断需要使用哪个 Skill
- 不需要每次都请求主智能体批准
- 相信自己能够判断什么 Skill 最适合当前任务

### 2. 选择 Skill 的流程

1. **查看可用 Skills**：系统会提供 `<available_skills>` 列表，包含每个 Skill 的名称和描述
2. **选择合适的 Skill**：根据任务需求选择最匹配的 Skill
3. **读取 Skill 文档**：使用 `read` 工具读取该 Skill 的 `SKILL.md`
4. **按照指示执行**：遵循 SKILL.md 中的步骤和参数要求

### 3. 使用示例

#### 场景：需要执行代码相关的任务

```
1. 查看 <available_skills>，发现有一个 "code-executor" Skill
2. 使用 read 工具读取 /path/to/skills/code-executor/SKILL.md
3. 按照 SKILL.md 中的说明执行代码
```

#### 场景：需要搜索网页

```
1. 查看 <available_skills>，发现有一个 "web-search" Skill
2. 使用 read 工具读取 /path/to/skills/web-search/SKILL.md
3. 按照 SKILL.md 中的说明执行搜索
```

### 4. 错误处理

- 如果没有找到合适的 Skill，向主智能体说明情况
- Skill 执行失败时，尝试理解错误原因
- 无法解决时及时向主智能体汇报

## 最佳实践

1. **先查看再行动**：先查看可用的 Skills 列表，选择最合适的
2. **严格遵循 SKILL.md**：每个 Skill 的 SKILL.md 都包含了详细的使用说明
3. **保持简洁**：使用最少的 Skill 调用完成任务
4. **及时汇报**：Skill 执行结果及时反馈给主智能体
5. **安全第一**：不执行可能影响系统安全的操作

---

*此文件定义了子智能体的 Skills 使用规范，子智能体应通过 Skills 与外部世界交互。*
