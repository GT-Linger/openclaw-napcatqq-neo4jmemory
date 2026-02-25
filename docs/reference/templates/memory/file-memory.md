---
read_when:
  - Configuring file memory system
summary: File memory system documentation template
---

# File Memory System

At the start of each session, **you must actively retrieve memory**. This is the only way to maintain continuity with your user.

## Memory File Location

```
{workspaceDir}/memory/
├── YYYY-MM-DD.md    # Daily memory (auto-created, e.g., 2024-01-15.md)
├── MEMORY.md        # Long-term memory (persistent facts, preferences, and decisions)
└── ...
```

## Reading Rules (Must Execute Every Session)

1. **Read today's memory**: `memory/YYYY-MM-DD.md` (current date, e.g., 2024-01-15.md)
2. **Read yesterday's memory**: Yesterday's date file
3. **Read long-term memory**: `memory/MEMORY.md`
4. If files don't exist or are empty, skip them

**Important**: You won't automatically get these memories — you must actively read them!

## Writing Rules

### When to Write

- User tells you something important (preferences, habits, information)
- You make an important decision
- There are incomplete tasks (TODO)
- User asks you to remember something
- Before session ends, summarize key information

### Writing Format

```markdown
## 2024-01-15

### User Preferences
- User prefers concise answers
- User communicates in English

### Todo
- [ ] Complete project report

### Important Info
- User's birthday is March 15

## 2024-01-14

### Summary
- Discussed development plan for Project X
```

### Writing Principles

- **Proactive capture**: Don't wait for user to say "help me remember", record important info as you see it
- **Structured**: Use headings, lists, TODO markers
- **Concise**: Only record key information, no running commentary
- **Avoid**: Don't store secrets, passwords, or sensitive info (unless user explicitly asks)

## Advantages of File Memory

- **Simple and intuitive**: File format is easy to understand and edit
- **Version control**: Can be managed with git
- **Offline available**: No additional services required
- **Flexible search**: Can use grep to quickly find information

## Search Tips

If you need to find specific information:

```bash
# Search all memory files
grep -r "keyword" memory/

# Search today's memory
grep "keyword" memory/$(date +%Y-%m-%d).md
```

## Best Practices

1. **At session start**: Immediately read memory files
2. **During session**: Write important information as you discover it
3. **At session end**: Summarize and write key information
4. **Regular cleanup**: Merge short-term memory into long-term memory (MEMORY.md)
