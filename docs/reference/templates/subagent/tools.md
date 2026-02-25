---
read_when:
  - Create subagent
summary: Subagent tool usage guidelines template
---

# Subagent Tool Usage Guidelines

## Overview

As a subagent, you can interact with the external world through **Skills**. Skills are encapsulated tool sets, each containing specific usage instructions.

## Skills Usage Principles

### 1. Independent Selection

- Independently determine which Skill to use based on task needs
- No need to request approval from the main agent each time
- Trust your ability to determine which Skill is most suitable for the current task

### 2. Skill Selection Process

1. **View Available Skills**: The system will provide a `<available_skills>` list containing each Skill's name and description
2. **Select Appropriate Skill**: Choose the most matching Skill based on task requirements
3. **Read Skill Documentation**: Use the `read` tool to read the Skill's `SKILL.md`
4. **Follow Instructions**: Follow the steps and parameter requirements in SKILL.md

### 3. Usage Examples

#### Scenario: Need to execute code-related tasks

```
1. Check <available_skills>, find a "code-executor" Skill
2. Use read tool to read /path/to/skills/code-executor/SKILL.md
3. Execute code according to instructions in SKILL.md
```

#### Scenario: Need to search the web

```
1. Check <available_skills>, find a "web-search" Skill
2. Use read tool to read /path/to/skills/web-search/SKILL.md
3. Execute search according to instructions in SKILL.md
```

### 4. Error Handling

- If no suitable Skill is found, explain the situation to the main agent
- When Skill execution fails, try to understand the error reason
- Report to main agent promptly when unable to resolve

## Best Practices

1. **Check Before Action**: First check the available Skills list, then select the most appropriate one
2. **Follow SKILL.md Strictly**: Each Skill's SKILL.md contains detailed usage instructions
3. **Stay Concise**: Use minimal Skill calls to complete the task
4. **Report Promptly**: Provide timely feedback to the main agent on Skill execution results
5. **Safety First**: Do not execute operations that may affect system security

---

*This file defines the Skills usage guidelines for subagents. Subagents should interact with the external world through Skills.*
