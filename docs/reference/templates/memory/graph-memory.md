---
read_when:
  - Configuring Neo4j graph memory system
summary: Neo4j graph memory system documentation template
---

# Neo4j Graph Memory System

At the start of each session, **you must actively retrieve memory**. This system is used when `plugins.slots.memory = "memory-neo4j"` is configured.

## What is Graph Memory

Neo4j graph database stores information as **nodes** and **relationships**, capturing complex connections between entities:

```
(user)--[likes]-->(programming)
(projectA)--[depends_on]-->(projectB)
(zhangsan)--[colleague]-->(lisi)
```

## Memory Sources

1. **Graph Database Query**: Use `memory_graph_search` tool to search
2. **Today's Memory**: Query all memory nodes stored today
3. **Incomplete Tasks**: Query task nodes marked as TODO

## Core Tools

### Search Memory

```json
{
  "tool": "memory_graph_search",
  "parameters": {
    "query": "user preference project",
    "limit": 10
  }
}
```

### Add Entity

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "person",
    "name": "John",
    "properties": {
      "role": "developer",
      "team": "frontend-team"
    }
  }
}
```

### Add Relationship

```json
{
  "tool": "memory_relation_add",
  "parameters": {
    "fromEntity": "John",
    "toEntity": "Jane",
    "relationType": "colleague"
  }
}
```

### Mark TODO

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "todo",
    "name": "Complete project report",
    "properties": {
      "status": "pending",
      "dueDate": "2024-01-20"
    }
  }
}
```

## Reading Rules (Must Execute Every Session)

1. **Use `memory_graph_search`**: Input keywords related to current task
2. **Search scope**: Today's + yesterday's memory
3. **Special attention to TODO nodes**: Query tasks with pending status
4. If no relevant information found, there is no memory in the graph yet

**Important**: You won't automatically get these memories — you must actively search!

## Writing Rules

### When to Write

- User tells you something important (preferences, habits, information)
- You make an important decision
- There are incomplete tasks (TODO)
- User asks you to remember something
- Before session ends, summarize key information to the graph

### Entity Types

| Type | Description | Example |
|------|-------------|---------|
| `person` | People | User, friends, colleagues |
| `project` | Projects | Products, development tasks |
| `task` | Tasks | Todo items, project tasks |
| `todo` | Todos | Things to complete |
| `knowledge` | Knowledge | Facts, information |
| `preference` | Preferences | User preference settings |
| `conversation` | Conversations | Conversation summary |
| `event` | Events | Meetings, appointments |

### Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `knows` | Knows | Relationship between people |
| `colleague` | Work relationship | Colleague relationship |
| `likes` | Preference | What user likes |
| `belongs_to` | Belonging | Which team belongs to |
| `depends_on` | Dependency | Dependencies between projects |
| `contains` | Contains | What conversation contains |
| `created` | Created | Who created a task |

### Writing Examples

```json
{
  "tool": "memory_entity_add",
  "parameters": {
    "entityType": "preference",
    "name": "User Preference",
    "properties": {
      "key": "answerStyle",
      "value": "concise",
      "reason": "User prefers concise answers"
    }
  }
}
```

```json
{
  "tool": "memory_relation_add",
  "parameters": {
    "fromEntity": "User",
    "toEntity": "Python",
    "relationType": "likes",
    "properties": {
      "confidence": 0.9
    }
  }
}
```

## Graph Structure Example

```cypher
// Person nodes
CREATE (p:Person {name: 'John', role: 'developer'})
CREATE (p2:Person {name: 'Jane', role: 'designer'})

// Relationship
CREATE (p)-[:colleague]->(p2)

// TODO node
CREATE (t:Todo {
  content: 'Complete project report',
  status: 'pending',
  createdAt: '2024-01-15',
  dueDate: '2024-01-20'
})

// Knowledge node
CREATE (k:Knowledge {
  topic: 'User Preference',
  content: 'User prefers concise answers',
  importance: 0.8
})
```

## Advantages of Graph Memory

- **Relationship aware**: Can understand complex relationships between entities
- **Multi-hop search**: Can find "friend of friend" type information
- **Structured**: Easy to perform complex queries
- **Efficient retrieval**: Fast search even with large-scale data
- **Automatic extraction**: Can automatically extract entities and relationships from conversations

## Search Tips

### Basic Search

```
user preference
project progress
today meeting
```

### Advanced Queries

- Search by time range: "memories from last week"
- Search by entity type: "all TODO tasks"
- Search by relationship: "all colleagues of John"

## Notes

1. **Active search**: Must search related memories at session start
2. **Active recording**: Immediately store important information to graph
3. **Build relationships**: Not only record entities, but also establish relationships
4. **Regular cleanup**: Clean up outdated TODOs and unused information
5. **Sensitive information**: Avoid storing secrets, passwords, or sensitive information
