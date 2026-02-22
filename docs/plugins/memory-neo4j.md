---
title: "Neo4j Memory Plugin"
summary: "Graph-based memory system with entity relationship extraction and multi-hop search"
read_when:
  - You want to configure Neo4j graph memory
  - You need entity extraction and relationship reasoning
  - You want multi-hop graph search capabilities
---

# Neo4j Memory Plugin

The Neo4j memory plugin provides a **graph-based memory system** for OpenClaw, enabling intelligent storage and retrieval of entities, relationships, and contextual information through a knowledge graph.

## Features

- **Entity Management**: Store and retrieve entities (people, projects, events, etc.)
- **Relationship Tracking**: Capture and query relationships between entities
- **Multi-hop Search**: Traverse the graph to find connected information
- **Auto-extraction**: Automatically extract entities and relations from conversations
- **Context Injection**: Automatically recall relevant memories before agent responses
- **Memory Decay**: Configurable forgetting mechanism for outdated information

## Installation

### Prerequisites

1. **Neo4j Database**: Install and run Neo4j (version 5.x recommended)
   - Docker: `docker run -p 7474:7474 -p 7687:7687 neo4j:latest`
   - Local: Download from [neo4j.com](https://neo4j.com/download/)
   - Cloud: Use [Neo4j Aura](https://neo4j.com/aura/) for managed service

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

### Enable the Plugin

Add to your OpenClaw configuration:

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

## Configuration

### Basic Configuration

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

### Full Configuration Reference

```json5
{
  plugins: {
    entries: {
      "memory-neo4j": {
        enabled: true,

        // Neo4j connection settings
        connection: {
          uri: "bolt://localhost:7687",      // Neo4j bolt URI
          username: "neo4j",                  // Database username
          password: "your-password",          // Database password (required)
          database: "neo4j"                   // Database name
        },

        // Model configuration for extraction
        models: {
          strategy: "hybrid",                 // "same-as-main" | "independent" | "hybrid"

          extraction: {
            // Quick extraction (fast, lightweight)
            quick: {
              enabled: true,
              provider: "openai",
              model: "gpt-4o-mini"
            },

            // Deep extraction (thorough, uses main model)
            deep: {
              enabled: true,
              useMainModel: true
            }
          }
        },

        // Extraction settings
        extraction: {
          mode: "hybrid",                     // "auto" | "manual" | "hybrid"
          minConfidence: 0.6                  // Minimum confidence threshold
        },

        // Lifecycle hooks
        lifecycle: {
          autoCapture: true,                  // Auto-extract from conversations
          autoRecall: true                    // Auto-inject relevant memories
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `connection.uri` | string | `bolt://localhost:7687` | Neo4j connection URI |
| `connection.username` | string | `neo4j` | Database username |
| `connection.password` | string | *required* | Database password |
| `connection.database` | string | `neo4j` | Database name |
| `models.strategy` | string | `hybrid` | Model selection strategy |
| `extraction.mode` | string | `hybrid` | Extraction mode |
| `extraction.minConfidence` | number | `0.6` | Minimum confidence for extraction |
| `lifecycle.autoCapture` | boolean | `true` | Auto-extract entities from conversations |
| `lifecycle.autoRecall` | boolean | `true` | Auto-inject memories into context |

## Entity Types

The plugin supports the following entity types:

| Type | Description | Example |
|------|-------------|---------|
| `Person` | People and characters | "张三", "Alice" |
| `Project` | Projects and work items | "小说《潜伏》", "Website Redesign" |
| `Character` | Fictional characters | "李四", "Harry Potter" |
| `Event` | Events and occurrences | "项目启动会", "Birthday Party" |
| `Place` | Locations | "北京", "Office" |
| `Fact` | Factual information | "公司成立于2020年" |
| `Decision` | Decisions made | "决定使用React框架" |
| `Preference` | User preferences | "喜欢简洁的设计风格" |
| `Goal` | Goals and objectives | "完成第一章节" |
| `Topic` | Discussion topics | "人工智能", "市场营销" |

## Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `KNOWS` | Person knows person | Alice KNOWS Bob |
| `BELONGS_TO` | Entity belongs to project | Task BELONGS_TO Project |
| `PARTICIPATED_IN` | Person participated in event | Alice PARTICIPATED_IN Meeting |
| `PREFERS` | Person has preference | Alice PREFERS dark mode |
| `DECIDED` | Person made decision | Team DECIDED to use React |
| `RELATED_TO` | General relationship | Topic A RELATED_TO Topic B |
| `CHARACTER_OF` | Character in story | 李四 CHARACTER_OF 小说《潜伏》 |
| `AUTHOR_OF` | Author relationship | 张三 AUTHOR_OF 小说《潜伏》 |
| `MENTIONED_IN` | Entity mentioned in context | Topic MENTIONED_IN Meeting |
| `HAPPENS_IN` | Event happens in place | Meeting HAPPENS_IN Office |

## Tools

### memory_graph_search

Search the knowledge graph for entities and their relationships.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (entity name, concept, or natural language) |
| `entityType` | string | No | Filter by entity type |
| `maxHops` | number | No | Maximum relationship hops (default: 3) |
| `maxResults` | number | No | Maximum results (default: 20) |
| `includeRelations` | boolean | No | Include related entities |
| `minConfidence` | number | No | Minimum confidence (default: 0.5) |
| `projectId` | string | No | Project context filter |

**Example:**

```json
{
  "query": "张三",
  "maxHops": 2,
  "includeRelations": true
}
```

### memory_entity_add

Add a new entity to the knowledge graph.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Entity type |
| `name` | string | Yes | Entity name |
| `content` | string | No | Entity description |
| `aliases` | string[] | No | Alternative names |
| `attributes` | object | No | Custom attributes |
| `confidence` | number | No | Confidence score (default: 0.8) |
| `projectId` | string | No | Associated project |

**Example:**

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

Create a relationship between two entities.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromEntity` | string | Yes | Source entity name or ID |
| `toEntity` | string | Yes | Target entity name or ID |
| `relationType` | string | Yes | Relationship type |
| `context` | string | No | Relationship context |
| `confidence` | number | No | Confidence score (default: 0.7) |

**Example:**

```json
{
  "fromEntity": "张三",
  "toEntity": "项目A",
  "relationType": "PARTICIPATED_IN",
  "context": "担任技术负责人",
  "confidence": 0.9
}
```

## CLI Commands

The plugin provides CLI commands for memory management:

```bash
# View memory status
openclaw memory-graph status

# Search the graph
openclaw memory-graph search "张三" --relations

# Add an entity
openclaw memory-graph entity add Person "李四" --content "产品经理"

# Add a relation
openclaw memory-graph relation add "张三" "李四" KNOWS

# Visualize graph (outputs DOT format)
openclaw memory-graph visualize --output graph.dot

# Cleanup old memories
openclaw memory-graph cleanup --max-age 365

# Export graph data
openclaw memory-graph export --format json --output backup.json
```

## Usage Examples

### Example 1: Project Context Tracking

```
User: 我在写一本小说，名字叫《潜伏》，主角叫李四。

AI: [自动提取]
- 创建实体: Project "小说《潜伏》"
- 创建实体: Character "李四"
- 创建关系: 李四 CHARACTER_OF 小说《潜伏》
```

```
User: 李四获取了一份重要的情报。

AI: [上下文关联]
- 识别 "李四" 为已知角色
- 创建实体: Event "获取情报"
- 创建关系: 李四 PARTICIPATED_IN 获取情报
- 创建关系: 获取情报 BELONGS_TO 小说《潜伏》
```

### Example 2: Multi-hop Search

```
User: 张三认识哪些人？

AI: [执行图谱搜索]
1. [Person] 张三
   关系路径: 张三 -[KNOWS]-> 李四, 张三 -[WORKS_WITH]-> 王五
   相关实体: 李四, 王五

张三认识李四和王五。
```

### Example 3: Preference Tracking

```
User: 我喜欢简洁的设计风格，不喜欢花哨的界面。

AI: [自动捕获]
- 创建实体: Preference "简洁的设计风格"
- 创建关系: User PREFERS 简洁的设计风格
```

## Memory Lifecycle

### Auto-Capture

When `lifecycle.autoCapture` is enabled, the plugin automatically extracts entities and relations from conversations:

1. Listens to `agent_end` events
2. Extracts user messages from the conversation
3. Runs entity and relation extraction
4. Stores results in the graph

### Auto-Recall

When `lifecycle.autoRecall` is enabled, relevant memories are injected before agent responses:

1. Listens to `before_agent_start` events
2. Searches the graph for entities matching the prompt
3. Injects found entities as context

### Memory Decay

The plugin supports automatic memory cleanup:

- **Decay**: Confidence decreases over time based on `halfLife` setting
- **Cleanup**: Low-confidence or old memories are periodically removed
- **Archive**: Optional archiving of old memories

```json5
{
  plugins: {
    entries: {
      "memory-neo4j": {
        forgetting: {
          decay: {
            enabled: true,
            halfLife: 2592000000,    // 30 days in ms
            minConfidence: 0.3
          },
          cleanup: {
            enabled: true,
            interval: 86400000,      // Daily cleanup
            maxAge: 31536000000      // 1 year in ms
          }
        }
      }
    }
  }
}
```

## Conflict Resolution

When conflicting information is detected, the plugin uses configurable strategies:

| Strategy | Description |
|----------|-------------|
| `confidence-based` | Keep higher confidence information |
| `newest-wins` | Keep most recent information |
| `ask-user` | Prompt user for resolution |

```json5
{
  conflictResolution: "confidence-based"
}
```

## Security Considerations

1. **Password Protection**: Never commit Neo4j passwords to version control
2. **Network Security**: Use TLS for remote Neo4j connections
3. **Access Control**: Configure Neo4j user roles appropriately
4. **Data Privacy**: Be aware that conversation content may be stored in the graph

## Troubleshooting

### Connection Issues

```
Error: Failed to connect to Neo4j
```

- Verify Neo4j is running: `docker ps` or check Neo4j Desktop
- Check connection URI and credentials
- Ensure network connectivity

### Memory Not Being Captured

- Check `lifecycle.autoCapture` is enabled
- Verify extraction model is configured
- Check logs for extraction errors

### Search Returns No Results

- Verify entities exist in the database
- Check `minConfidence` threshold
- Ensure proper entity type filtering

## Migration from Other Memory Systems

To migrate from the default memory system:

1. Export existing memories
2. Transform to graph format
3. Import using CLI or API

```bash
# Export from default memory
openclaw memory export --format json > memories.json

# Import to Neo4j (custom script required)
node scripts/migrate-to-neo4j.js memories.json
```

## Performance Tuning

### Indexing

Neo4j automatically creates indexes for common queries. For large datasets, consider:

```cypher
CREATE INDEX entity_name IF NOT EXISTS FOR (n:Entity) ON (n.name);
CREATE INDEX entity_type IF NOT EXISTS FOR (n:Entity) ON (n.type);
```

### Query Optimization

- Use `maxHops` to limit traversal depth
- Set appropriate `maxResults` to avoid large result sets
- Use `entityType` filtering to narrow search scope

### Caching

The plugin supports caching for frequently accessed entities:

```json5
{
  performance: {
    cacheEnabled: true,
    cacheTTL: 3600000,      // 1 hour
    cacheMaxSize: 1000
  }
}
```

## API Reference

For programmatic access, see the exported classes:

```typescript
import {
  Neo4jConnection,
  GraphStore,
  SessionContextManager,
  EntityExtractor,
  RelationExtractor
} from "@openclaw/memory-neo4j";
```

## See Also

- [Memory Concepts](/concepts/memory) - General memory system overview
- [Plugin Development](/tools/plugin) - Building OpenClaw plugins
- [Neo4j Documentation](https://neo4j.com/docs/) - Official Neo4j docs
