---
read_when:
  - Configure subagent feature
summary: Subagent usage guidelines template
---

# Subagent Usage Guidelines

Subagents are "assistants" of the main agent and can help you process multiple tasks in parallel. You can use subagents when you need to execute multiple independent tasks simultaneously.

## How Subagents Work

1. **At Startup**: The system automatically handles based on the model provider bound to the subagent (loading models, etc.)
2. **Executing Tasks**: The subagent processes assigned tasks
3. **After Completion**: The system automatically handles resource release (unloading models, etc.)

## Basic Usage

### Launch Subagent

```json
{
  "tool": "sessions_spawn",
  "parameters": {
    "task": "Analyze today's sales data",
    "label": "Sales Data Analysis",
    "subagentId": "code-assistant"
  }
}
```

### Key Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `task` | Yes | Task description for the subagent |
| `label` | Yes | Task label for distinguishing different tasks |
| `subagentId` | No | Specify subagent ID (select from subagent list) |
| `model` | No | Override default model configuration |

### Receiving Results

When the subagent completes, you will receive a notification message:

```
✅ Subagent main completed this task

Result:
[Analysis result...]

A subagent task "Sales Data Analysis" just completed successfully.
```

## Importance of Task Label

- Subagent tasks are **non-blocking**; multiple tasks can run in parallel
- When multiple subagent tasks run simultaneously, use `label` to distinguish each task's results
- Results returned will carry the `label` identifier, helping you accurately convey results to the user

### Multi-Task Example

```json
// Launch two tasks simultaneously
{
  "tool": "sessions_spawn",
  "parameters": {
    "task": "Analyze sales data",
    "label": "Sales Data Analysis"
  }
}
{
  "tool": "sessions_spawn",
  "parameters": {
    "task": "Generate monthly report",
    "label": "Monthly Report Generation"
  }
}
```

## Subagent Working Directory

Each subagent has its own working directory:

```
{workspaceDir}/subagents/{subagentId}/
├── personality.md      # Subagent personality settings
├── system-prompt.md    # Custom system prompt
├── tools.md           # Tool usage guidelines
├── behavior.md        # Behavior guidelines
└── config.json         # Configuration info (managed by subagents.json)
```

Subagents automatically load these files to get specific personality, tool usage guidelines, and behavior configuration.

### File Description

| File | Description | Required |
|------|-------------|----------|
| `personality.md` | Identity and values setting | Yes |
| `tools.md` | Tool usage guidelines | Yes |
| `behavior.md` | Behavior boundaries and prohibitions | Yes |
| `system-prompt.md` | Custom system prompt (optional) | No |

## Managing Subagents

### List Subagents

```json
{
  "tool": "subagents",
  "parameters": {
    "action": "list"
  }
}
```

### View Subagent Status

```json
{
  "tool": "subagents",
  "parameters": {
    "action": "status"
  }
}
```

### Terminate Subagent

```json
{
  "tool": "subagents",
  "parameters": {
    "action": "kill",
    "runId": "xxx"
  }
}
```

## Best Practices

1. **Clear Task Description**: Give the subagent a clear task description
2. **Use Labels**: Always use `label` to distinguish tasks
3. **Reasonable Division**: Assign tasks based on subagent's expertise
4. **Parallel Processing**: Independent tasks can be executed in parallel
5. **Result Aggregation**: Integrate subagent results before responding to the user

## Usage Scenario Examples

### Scenario 1: Code Review

```
Main agent receives request: "Help me review code and search for related information"

1. Launch subagent A (code assistant): "Review this code segment"
2. Launch subagent B (search assistant): "Search for related information"
3. Wait for both subagents to complete
4. Integrate results and return to user
```

### Scenario 2: Multi-Document Processing

```
Main agent receives request: "Summarize these three documents"

1. Launch three subagents to process each document
2. Wait for all to complete
3. Aggregate to generate final summary
```
