import { Type } from "@sinclair/typebox";
import type { GraphStore } from "../db/store.js";
import type { Neo4jMemoryConfig } from "../config.js";
import type { MemoryNodeType, MemoryNode } from "../types.js";

export function createMemoryEntityAddTool(options: {
  graphStore: GraphStore;
  config: Neo4jMemoryConfig;
  sessionKey?: string;
}) {
  const { graphStore, config } = options;

  return {
    name: "memory_entity_add",
    label: "Memory Entity Add",
    description:
      "向知识图谱添加新实体。用于存储人物、项目、角色、事件等信息。" +
      "如果实体已存在，将更新其属性。",
    parameters: Type.Object({
      type: Type.String({ description: "实体类型 (Person, Project, Character, Event, Place, Fact, Decision, Preference, Goal)" }),
      name: Type.String({ description: "实体名称" }),
      content: Type.Optional(Type.String({ description: "实体描述" })),
      aliases: Type.Optional(Type.Array(Type.String(), { description: "别名列表" })),
      attributes: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "实体属性" })),
      confidence: Type.Optional(Type.Number({ description: "置信度 0-1（默认: 0.8）" })),
      projectId: Type.Optional(Type.String({ description: "所属项目" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const type = params.type as MemoryNodeType;
      const name = params.name as string;
      const content = params.content as string | undefined;
      const aliases = params.aliases as string[] | undefined;
      const attributes = params.attributes as Record<string, unknown> | undefined;
      const confidence = (params.confidence as number | undefined) ?? 0.8;
      const projectId = params.projectId as string | undefined;

      try {
        const existing = await graphStore.findSimilarEntity(name, type, aliases);

        let entity: MemoryNode | null;
        let action: "created" | "updated";

        if (existing && existing.confidence >= 0.8) {
          entity = await graphStore.updateEntity(existing.id, {
            content,
            aliases,
            attributes,
            confidence,
          });
          action = "updated";
        } else {
          entity = await graphStore.createEntity({
            type,
            name,
            content,
            aliases,
            attributes,
            confidence,
            source: {
              type: "explicit",
              timestamp: Date.now(),
            },
          });
          action = "created";
        }

        if (!entity) {
          return {
            content: [{ type: "text", text: `创建实体失败: ${name}` }],
            details: { error: "create_failed" },
          };
        }

        if (projectId && action === "created") {
          const project = await graphStore.getEntityByName(projectId);
          if (project) {
            await graphStore.createRelation({
              fromId: entity.id,
              toId: project.id,
              type: "BELONGS_TO",
              confidence: 0.9,
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: action === "created"
                ? `已创建实体: ${entity.name} (${entity.type})`
                : `已更新实体: ${entity.name} (${entity.type})`,
            },
          ],
          details: {
            action,
            entity: {
              id: entity.id,
              name: entity.name,
              type: entity.type,
              confidence: entity.confidence,
            },
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `添加实体失败: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}
