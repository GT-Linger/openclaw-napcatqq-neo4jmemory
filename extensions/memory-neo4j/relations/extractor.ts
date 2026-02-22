import type { Neo4jMemoryConfig } from "../config.js";
import type { GraphStore } from "../db/store.js";
import type {
  ExtractionResult,
  ExtractionRelation,
  MemoryRelationType,
  MemoryNode,
} from "../types.js";
import type { LLMProvider } from "../entities/extractor.js";

const RELATION_INFERENCE_PROMPT = `基于以下实体信息，推断可能存在的关系。

## 已知实体
{entities}

## 上下文
{context}

## 任务
分析实体之间可能存在的关系，输出JSON格式：
{
  "inferredRelations": [
    {
      "from": "实体名称",
      "to": "实体名称",
      "type": "关系类型",
      "confidence": 0.0-1.0,
      "reasoning": "推断理由"
    }
  ]
}

仅输出JSON：`;

export class RelationExtractor {
  constructor(
    private config: Neo4jMemoryConfig,
    private graphStore: GraphStore,
    private llm: LLMProvider
  ) {}

  async inferRelations(
    entities: MemoryNode[],
    context?: string
  ): Promise<ExtractionRelation[]> {
    if (entities.length < 2) {
      return [];
    }

    const entityDescriptions = entities
      .map((e) => `- ${e.name} (${e.type}): ${e.content || "无描述"}`)
      .join("\n");

    const prompt = RELATION_INFERENCE_PROMPT.replace("{entities}", entityDescriptions).replace(
      "{context}",
      context || "无额外上下文"
    );

    try {
      const response = await this.llm.complete({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt,
        temperature: 0.2,
        maxTokens: 1000,
      });

      const parsed = JSON.parse(response.text);
      return (parsed.inferredRelations || []).filter(
        (r: ExtractionRelation) =>
          r.confidence >= (this.config.extraction?.minConfidence ?? 0.6)
      );
    } catch (err) {
      console.error("memory-neo4j: relation inference failed", err);
      return [];
    }
  }

  async validateRelation(
    fromId: string,
    toId: string,
    relationType: MemoryRelationType
  ): Promise<boolean> {
    const from = await this.graphStore.getEntityById(fromId);
    const to = await this.graphStore.getEntityById(toId);

    if (!from || !to) {
      return false;
    }

    const validRelations = this.getValidRelationsForTypes(from.type, to.type);
    return validRelations.includes(relationType);
  }

  private getValidRelationsForTypes(
    fromType: string,
    toType: string
  ): MemoryRelationType[] {
    const relationMatrix: Record<string, Record<string, MemoryRelationType[]>> = {
      Person: {
        Person: ["KNOWS", "RELATED_TO"],
        Place: ["LOCATED_AT"],
        Organization: ["BELONGS_TO", "WORKS_ON"],
        Project: ["AUTHOR_OF", "WORKS_ON", "PARTICIPATED_IN"],
        Character: ["CREATED"],
        Event: ["PARTICIPATED_IN"],
        Concept: ["PREFERS", "KNOWS"],
      },
      Character: {
        Character: ["KNOWS", "RELATED_TO", "CONFLICTS_WITH"],
        Place: ["LOCATED_AT"],
        Project: ["CHARACTER_OF", "BELONGS_TO"],
        Event: ["PARTICIPATED_IN"],
        Item: ["HAS_ATTRIBUTE", "RELATED_TO"],
      },
      Project: {
        Character: ["HAS_ATTRIBUTE"],
        Event: ["HAS_ATTRIBUTE"],
        Item: ["HAS_ATTRIBUTE"],
        Place: ["LOCATED_AT"],
      },
      Event: {
        Character: ["PARTICIPATED_IN"],
        Place: ["LOCATED_AT", "HAPPENED_ON"],
        Project: ["EVENT_OF", "BELONGS_TO"],
        Event: ["FOLLOWS", "CAUSES"],
      },
      Place: {
        Event: ["HAPPENED_ON"],
        Person: ["LOCATED_AT"],
      },
    };

    return relationMatrix[fromType]?.[toType] || ["RELATED_TO"];
  }

  async findRelatedEntities(
    entityId: string,
    maxDepth: number = 2
  ): Promise<MemoryNode[]> {
    const relations = await this.graphStore.getRelations(entityId);
    const related: MemoryNode[] = [];

    for (const rel of relations) {
      const targetId = rel.fromId === entityId ? rel.toId : rel.fromId;
      const node = await this.graphStore.getEntityById(targetId);
      if (node) {
        related.push(node);
      }
    }

    return related;
  }

  async enrichExtractionWithRelations(
    extraction: ExtractionResult,
    existingEntities: MemoryNode[]
  ): Promise<ExtractionResult> {
    const allEntities = [
      ...existingEntities,
      ...extraction.entities
        .filter((e) => e.action === "create")
        .map((e) => ({
          id: e.id || "",
          type: e.type,
          name: e.name,
          content: "",
          aliases: e.aliases || [],
          confidence: e.confidence,
          priority: { level: "normal" as const, factors: {} },
          source: { type: "inferred" as const, timestamp: Date.now() },
          attributes: e.attributes || {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          metadata: {},
        })),
    ];

    if (allEntities.length >= 2) {
      const inferredRelations = await this.inferRelations(allEntities);

      const existingRelationKeys = new Set(
        extraction.relations.map((r) => `${r.from}-${r.type}-${r.to}`)
      );

      for (const rel of inferredRelations) {
        const key = `${rel.from}-${rel.type}-${rel.to}`;
        if (!existingRelationKeys.has(key)) {
          extraction.relations.push(rel);
          existingRelationKeys.add(key);
        }
      }
    }

    return extraction;
  }
}

export function detectRelationType(text: string): MemoryRelationType | null {
  const patterns: Array<{ pattern: RegExp; type: MemoryRelationType }> = [
    { pattern: /认识|知道|了解|knows/i, type: "KNOWS" },
    { pattern: /位于|在|located|at/i, type: "LOCATED_AT" },
    { pattern: /参与|参加|participated|joined/i, type: "PARTICIPATED_IN" },
    { pattern: /偏好|喜欢|prefer|like/i, type: "PREFERS" },
    { pattern: /决定|选择|decided|chose/i, type: "DECIDED" },
    { pattern: /属于|归属于|belongs|part of/i, type: "BELONGS_TO" },
    { pattern: /是.*的角色|character of/i, type: "CHARACTER_OF" },
    { pattern: /是.*的作者|author of|written by/i, type: "AUTHOR_OF" },
    { pattern: /导致|引起|causes|leads to/i, type: "CAUSES" },
    { pattern: /冲突|矛盾|conflicts|contradicts/i, type: "CONFLICTS_WITH" },
    { pattern: /跟随|后续|follows|after/i, type: "FOLLOWS" },
  ];

  for (const { pattern, type } of patterns) {
    if (pattern.test(text)) {
      return type;
    }
  }

  return null;
}
