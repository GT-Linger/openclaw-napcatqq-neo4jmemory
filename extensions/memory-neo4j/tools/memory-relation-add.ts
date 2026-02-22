import { Type } from "@sinclair/typebox";
import type { GraphStore } from "../db/store.js";
import type { Neo4jMemoryConfig } from "../config.js";
import type { MemoryRelationType, MemoryRelation } from "../types.js";

export function createMemoryRelationAddTool(options: {
  graphStore: GraphStore;
  config: Neo4jMemoryConfig;
  sessionKey?: string;
}) {
  const { graphStore } = options;

  return {
    name: "memory_relation_add",
    label: "Memory Relation Add",
    description:
      "在知识图谱中创建实体间的关系。用于建立人物关系、项目归属、事件参与等关联。",
    parameters: Type.Object({
      fromEntity: Type.String({ description: "源实体名称或ID" }),
      toEntity: Type.String({ description: "目标实体名称或ID" }),
      relationType: Type.String({ description: "关系类型 (KNOWS, BELONGS_TO, PARTICIPATED_IN, PREFERS, DECIDED, RELATED_TO, etc.)" }),
      context: Type.Optional(Type.String({ description: "关系上下文" })),
      confidence: Type.Optional(Type.Number({ description: "置信度 0-1（默认: 0.7）" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const fromEntity = params.fromEntity as string;
      const toEntity = params.toEntity as string;
      const relationType = params.relationType as MemoryRelationType;
      const context = params.context as string | undefined;
      const confidence = (params.confidence as number | undefined) ?? 0.7;

      try {
        let fromId: string | undefined;
        let toId: string | undefined;

        const fromById = await graphStore.getEntityById(fromEntity);
        if (fromById) {
          fromId = fromById.id;
        } else {
          const fromByName = await graphStore.getEntityByName(fromEntity);
          if (fromByName) {
            fromId = fromByName.id;
          }
        }

        const toById = await graphStore.getEntityById(toEntity);
        if (toById) {
          toId = toById.id;
        } else {
          const toByName = await graphStore.getEntityByName(toEntity);
          if (toByName) {
            toId = toByName.id;
          }
        }

        const relation = await graphStore.createRelation({
          fromId,
          fromName: fromId ? undefined : fromEntity,
          toId,
          toName: toId ? undefined : toEntity,
          type: relationType,
          context,
          confidence,
          source: {
            type: "explicit",
            timestamp: Date.now(),
          },
        });

        if (!relation) {
          return {
            content: [
              {
                type: "text",
                text: `无法创建关系：找不到实体 "${fromEntity}" 或 "${toEntity}"`,
              },
            ],
            details: { error: "entities_not_found" },
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `已创建关系: ${fromEntity} -[${relationType}]-> ${toEntity}`,
            },
          ],
          details: {
            action: "created",
            relation: {
              id: relation.id,
              type: relation.type,
              confidence: relation.confidence,
            },
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `添加关系失败: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}
