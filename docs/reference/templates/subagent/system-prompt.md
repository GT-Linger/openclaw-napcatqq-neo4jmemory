---
read_when:
  - Create subagent
summary: Subagent custom system prompt template
---

# Subagent Custom System Prompt

## Overview

This file is used to add additional system-level instructions that supplement or override the default subagent behavior.

## Usage Scenarios

- Add task-specific operation guidelines
- Define special output format requirements
- Specify additional behavior rules
- Add domain knowledge or context

## Notes

- This file is **optional** content
- The content of this file will be appended to the end of the system prompt
- Keep content concise and avoid conflicting with default rules

## Examples

### Example 1: Code Review Task

```markdown
# Code Review Additional Guidelines

1. Focus on code security and performance issues
2. Output review results in English
3. Each review result should include: problem description, severity level, fix suggestions
```

### Example 2: Data Processing Task

```markdown
# Data Processing Additional Guidelines

1. Maintain consistency when processing data
2. Output format should use JSON
3. Keep processing logs for audit purposes
```

---

*This file is an optional custom system prompt for adding additional task guidance.*
