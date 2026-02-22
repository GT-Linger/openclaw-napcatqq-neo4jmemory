import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Neo4jConnection } from "./db/connection.js";
import { GraphStore } from "./db/store.js";
import { SessionContextManager } from "./entities/context-manager.js";
import { EntityExtractor, type LLMProvider } from "./entities/extractor.js";
import { RelationExtractor } from "./relations/extractor.js";
import { createMaintenanceScheduler } from "./utils/maintenance.js";
import { registerNeo4jCli } from "./cli/commands.js";
import type { MemoryNodeType, MemoryNode, MemoryRelation, MemorySearchResult } from "./types.js";
import type { Neo4jMemoryConfig } from "./config.js";

const neo4jMemoryPluginConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  connection: Type.Object({
    uri: Type.String({ default: "bolt://localhost:7687" }),
    username: Type.String({ default: "neo4j" }),
    password: Type.String({ default: "" }),
    database: Type.Optional(Type.String({ default: "neo4j" })),
  }),
  models: Type.Optional(
    Type.Object({
      strategy: Type.Optional(
        Type.Union([Type.Literal("same-as-main"), Type.Literal("independent"), Type.Literal("hybrid")])
      ),
      extraction: Type.Optional(
        Type.Object({
          quick: Type.Optional(
            Type.Object({
              enabled: Type.Optional(Type.Boolean({ default: true })),
              provider: Type.Optional(Type.String()),
              model: Type.Optional(Type.String()),
              temperature: Type.Optional(Type.Number()),
              maxTokens: Type.Optional(Type.Number()),
            })
          ),
          deep: Type.Optional(
            Type.Object({
              enabled: Type.Optional(Type.Boolean({ default: true })),
              useMainModel: Type.Optional(Type.Boolean({ default: true })),
              provider: Type.Optional(Type.String()),
              model: Type.Optional(Type.String()),
              temperature: Type.Optional(Type.Number()),
              maxTokens: Type.Optional(Type.Number()),
              triggerOn: Type.Optional(
                Type.Object({
                  entityCount: Type.Optional(Type.Number()),
                  relationCount: Type.Optional(Type.Number()),
                  userKeywords: Type.Optional(Type.Array(Type.String())),
                })
              ),
            })
          ),
        })
      ),
    })
  ),
  extraction: Type.Optional(
    Type.Object({
      mode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("manual"), Type.Literal("hybrid")])),
      minConfidence: Type.Optional(Type.Number({ default: 0.6 })),
    })
  ),
  lifecycle: Type.Optional(
    Type.Object({
      autoCapture: Type.Optional(Type.Boolean({ default: true })),
      autoRecall: Type.Optional(Type.Boolean({ default: true })),
    })
  ),
});

function resolveConfig(pluginConfig: Record<string, unknown> | undefined): Neo4jMemoryConfig {
  const conn = pluginConfig?.connection as Record<string, unknown> | undefined;
  const models = pluginConfig?.models as Record<string, unknown> | undefined;
  const extraction = pluginConfig?.extraction as Record<string, unknown> | undefined;
  const lifecycle = pluginConfig?.lifecycle as Record<string, unknown> | undefined;

  const extractionModels = models?.extraction as Record<string, unknown> | undefined;
  const quickConfig = extractionModels?.quick as Record<string, unknown> | undefined;
  const deepConfig = extractionModels?.deep as Record<string, unknown> | undefined;
  const triggerOn = deepConfig?.triggerOn as Record<string, unknown> | undefined;

  return {
    enabled: (pluginConfig?.enabled as boolean) ?? true,
    connection: {
      uri: (conn?.uri as string) ?? "bolt://localhost:7687",
      username: (conn?.username as string) ?? "neo4j",
      password: (conn?.password as string) ?? "",
      database: (conn?.database as string) ?? "neo4j",
      maxConnectionPoolSize: (conn?.maxConnectionPoolSize as number) ?? 50,
      connectionTimeout: (conn?.connectionTimeout as number) ?? 30000,
    },
    models: {
      strategy: (models?.strategy as "same-as-main" | "independent" | "hybrid") ?? "hybrid",
      extraction: {
        quick: {
          enabled: (quickConfig?.enabled as boolean) ?? true,
          provider: quickConfig?.provider as string | undefined,
          model: quickConfig?.model as string | undefined,
          temperature: (quickConfig?.temperature as number) ?? 0.1,
          maxTokens: (quickConfig?.maxTokens as number) ?? 1000,
        },
        deep: {
          enabled: (deepConfig?.enabled as boolean) ?? true,
          useMainModel: (deepConfig?.useMainModel as boolean) ?? true,
          provider: deepConfig?.provider as string | undefined,
          model: deepConfig?.model as string | undefined,
          temperature: (deepConfig?.temperature as number) ?? 0.1,
          maxTokens: (deepConfig?.maxTokens as number) ?? 2000,
          triggerOn: triggerOn
            ? {
                entityCount: (triggerOn.entityCount as number) ?? 3,
                relationCount: (triggerOn.relationCount as number) ?? 2,
                userKeywords: (triggerOn.userKeywords as string[]) ?? [
                  "记住",
                  "remember",
                  "重要",
                  "important",
                  "保存",
                  "save",
                ],
              }
            : undefined,
        },
      },
    },
    extraction: {
      mode: (extraction?.mode as "auto" | "manual" | "hybrid") ?? "hybrid",
      minConfidence: (extraction?.minConfidence as number) ?? 0.6,
      maxChars: 2000,
    },
    retrieval: {
      maxHops: 3,
      maxResults: 20,
      minConfidence: 0.5,
      includeContext: true,
    },
    lifecycle: {
      autoCapture: (lifecycle?.autoCapture as boolean) ?? true,
      autoRecall: (lifecycle?.autoRecall as boolean) ?? true,
      recallLimit: 5,
    },
    forgetting: {
      decay: {
        enabled: true,
        halfLife: 30 * 24 * 60 * 60 * 1000,
        minConfidence: 0.3,
      },
      cleanup: {
        enabled: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        minAccessCount: 0,
        interval: 24 * 60 * 60 * 1000,
      },
    },
    conflictResolution: "confidence-based",
  };
}

const memoryNeo4jPlugin = {
  id: "memory-neo4j",
  name: "Memory (Neo4j)",
  description: "Neo4j 图谱记忆系统 - 支持实体关系提取、多跳搜索和上下文关联",
  kind: "memory" as const,
  configSchema: neo4jMemoryPluginConfigSchema,

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);

    if (!config.enabled) {
      api.logger.info("memory-neo4j: plugin disabled");
      return;
    }

    if (!config.connection.password) {
      api.logger.warn("memory-neo4j: no password configured, set plugins.memory-neo4j.connection.password");
    }

    const connection = new Neo4jConnection(config.connection);
    const graphStore = new GraphStore(connection);
    const contextManager = new SessionContextManager();

    const llm: LLMProvider = {
      complete: async (params) => {
        const result = await api.runtime.llm.complete({
          provider: params.provider,
          model: params.model,
          prompt: params.prompt,
          systemPrompt: params.systemPrompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
        });
        return { text: result.text };
      },
      getMainModel: () => api.runtime.llm.getMainModel(),
    };

    const entityExtractor = new EntityExtractor(config, graphStore, contextManager, llm);
    const relationExtractor = new RelationExtractor(config, graphStore, llm);

    entityExtractor.onDeepExtractionComplete(async (sessionId, result) => {
      try {
        await connection.initialize();
        await storeExtraction(graphStore, result, sessionId);
        api.logger.info(
          `memory-neo4j: deep extraction stored ${result.entities.length} entities, ${result.relations.length} relations`
        );
      } catch (err) {
        api.logger.warn(`memory-neo4j: deep extraction storage failed: ${String(err)}`);
      }
    });

    api.logger.info("memory-neo4j: plugin registered (lazy init)");

    api.registerTool(
      {
        name: "memory_graph_search",
        label: "Memory Graph Search",
        description:
          "搜索知识图谱中的实体及其关系。用于查找关联信息、关系查询和多跳推理。" +
          "示例：'Alice认识谁？'、'项目X做了什么决策？'、'显示用户Y的偏好链'",
        parameters: Type.Object({
          query: Type.String({ description: "搜索查询（实体名称、概念或自然语言）" }),
          entityType: Type.Optional(Type.String({ description: "按实体类型过滤" })),
          maxHops: Type.Optional(Type.Number({ description: "最大关系跳数（默认: 3）" })),
          maxResults: Type.Optional(Type.Number({ description: "最大结果数（默认: 20）" })),
          includeRelations: Type.Optional(Type.Boolean({ description: "包含关联实体" })),
          minConfidence: Type.Optional(Type.Number({ description: "最小置信度（默认: 0.5）" })),
          projectId: Type.Optional(Type.String({ description: "项目上下文" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const query = params.query as string;
          const entityType = params.entityType as MemoryNodeType | undefined;
          const maxHops = (params.maxHops as number | undefined) ?? config.retrieval?.maxHops ?? 3;
          const maxResults = (params.maxResults as number | undefined) ?? config.retrieval?.maxResults ?? 20;
          const includeRelations = (params.includeRelations as boolean | undefined) ?? config.retrieval?.includeContext;
          const minConfidence = (params.minConfidence as number | undefined) ?? config.retrieval?.minConfidence ?? 0.5;
          const projectId = params.projectId as string | undefined;

          try {
            await connection.initialize();
            const results = await graphStore.searchEntities({
              query,
              entityType,
              maxHops,
              maxResults,
              includeRelations,
              minConfidence,
              projectId,
            });

            if (results.length === 0) {
              return {
                content: [{ type: "text", text: "未找到相关记忆。" }],
                details: { count: 0, results: [] },
              };
            }

            const text = formatSearchResults(results);

            return {
              content: [{ type: "text", text }],
              details: {
                count: results.length,
                results: results.map((r) => ({
                  id: r.node.id,
                  name: r.node.name,
                  type: r.node.type,
                  confidence: r.node.confidence,
                  score: r.score,
                })),
              },
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `搜索失败: ${message}` }],
              details: { error: message },
            };
          }
        },
      },
      { name: "memory_graph_search" },
    );

    api.registerTool(
      {
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
            await connection.initialize();
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
      },
      { name: "memory_entity_add" },
    );

    api.registerTool(
      {
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
          const relationType = params.relationType as MemoryRelation["type"];
          const context = params.context as string | undefined;
          const confidence = (params.confidence as number | undefined) ?? 0.7;

          try {
            await connection.initialize();

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
      },
      { name: "memory_relation_add" },
    );

    api.registerCli(
      ({ program }) => {
        registerNeo4jCli(program, connection, graphStore, config);
      },
      { commands: ["memory-graph", "mg"] },
    );

    if (config.lifecycle?.autoRecall) {
      api.on("before_agent_start", async (event, _ctx) => {
        if (!event.prompt || event.prompt.length < 5) {
          return;
        }

        try {
          await connection.initialize();

          const results = await graphStore.searchEntities({
            query: event.prompt,
            maxResults: config.lifecycle?.recallLimit ?? 5,
            includeRelations: true,
          });

          if (results.length === 0) {
            return;
          }

          const contextBlock = formatEntitiesAsContext(results.map((r) => r.node));

          api.logger.info(`memory-neo4j: injecting ${results.length} entities into context`);

          return {
            prependContext: contextBlock,
          };
        } catch (err) {
          api.logger.warn(`memory-neo4j: recall failed: ${String(err)}`);
        }
      });
    }

    if (config.lifecycle?.autoCapture) {
      api.on("agent_end", async (event, _ctx) => {
        if (!event.success || !event.messages) {
          return;
        }

        try {
          await connection.initialize();

          const userMessages = extractUserMessages(event.messages);
          if (userMessages.length === 0) {
            return;
          }

          const sessionId = "default";

          for (const msg of userMessages) {
            if (msg.length < 10 || msg.length > (config.extraction?.maxChars ?? 2000)) {
              continue;
            }

            const extraction = await entityExtractor.extract(msg, sessionId);

            if (extraction.entities.length > 0 || extraction.relations.length > 0) {
              await storeExtraction(graphStore, extraction, sessionId);

              api.logger.info(`memory-neo4j: auto-extracted ${extraction.entities.length} entities, ${extraction.relations.length} relations`);
            }
          }
        } catch (err) {
          api.logger.warn(`memory-neo4j: auto-capture failed: ${String(err)}`);
        }
      });
    }

    createMaintenanceScheduler({
      graphStore,
      config,
      logger: api.logger,
    });
  },
};

function extractUserMessages(messages: unknown[]): string[] {
  const texts: string[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      continue;
    }

    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role;

    if (role !== "user") {
      continue;
    }

    const content = msgObj.content;

    if (typeof content === "string") {
      texts.push(content);
      continue;
    }

    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          (block as Record<string, unknown>).type === "text" &&
          "text" in block &&
          typeof (block as Record<string, unknown>).text === "string"
        ) {
          texts.push((block as Record<string, unknown>).text as string);
        }
      }
    }
  }

  return texts;
}

async function storeExtraction(
  graphStore: GraphStore,
  extraction: Awaited<ReturnType<EntityExtractor["extract"]>>,
  sessionId: string
): Promise<void> {
  const source = {
    type: "conversation" as const,
    sessionId,
    timestamp: Date.now(),
  };

  for (const entity of extraction.entities) {
    if (entity.action === "create") {
      await graphStore.createEntity({
        type: entity.type,
        name: entity.name,
        content: entity.attributes?.description as string | undefined,
        aliases: entity.aliases,
        attributes: entity.attributes,
        confidence: entity.confidence,
        source,
      });
    } else if (entity.action === "update" && entity.id) {
      await graphStore.updateEntity(entity.id, {
        attributes: entity.attributes,
        confidence: entity.confidence,
      });
    }
  }

  for (const relation of extraction.relations) {
    await graphStore.createRelation({
      fromName: relation.from,
      toName: relation.to,
      type: relation.type,
      context: relation.context,
      confidence: relation.confidence,
      source,
    });
  }
}

function formatSearchResults(results: MemorySearchResult[]): string {
  const lines: string[] = [`找到 ${results.length} 条记忆:\n`];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const node = r.node;

    lines.push(`${i + 1}. [${node.type}] ${node.name}`);
    if (node.content) {
      lines.push(`   描述: ${node.content.slice(0, 200)}${node.content.length > 200 ? "..." : ""}`);
    }
    lines.push(`   置信度: ${(node.confidence * 100).toFixed(0)}%`);

    if (r.path && r.path.length > 0) {
      const pathStr = r.path
        .map((p) => `${p.from} -[${p.relation}]-> ${p.to}`)
        .join(", ");
      lines.push(`   关系路径: ${pathStr}`);
    }

    if (r.relatedNodes && r.relatedNodes.length > 0) {
      const relatedStr = r.relatedNodes
        .slice(0, 3)
        .map((n) => n.name)
        .join(", ");
      lines.push(`   相关实体: ${relatedStr}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function formatEntitiesAsContext(
  entities: Array<{ name: string; type: string; content?: string; attributes?: Record<string, unknown> }>
): string {
  const lines = entities.map((e) => {
    const attrs = e.attributes
      ? Object.entries(e.attributes)
          .filter(([k]) => !["project", "description"].includes(k))
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      : "";
    return `- [${e.type}] ${e.name}${e.content ? `: ${e.content.slice(0, 100)}` : ""}${attrs ? ` (${attrs})` : ""}`;
  });

  return `<graph-memory>
已知实体和关系（仅供参考）:
${lines.join("\n")}
</graph-memory>`;
}

export default memoryNeo4jPlugin;

export { Neo4jConnection, GraphStore, SessionContextManager, EntityExtractor, RelationExtractor };
export type { Neo4jMemoryConfig } from "./config.js";
export { neo4jMemoryOnboardingAdapter } from "./onboarding.js";
export type {
  MemoryOnboardingAdapter,
  MemoryOnboardingStatus,
  MemoryOnboardingContext,
  MemoryOnboardingConfigureContext,
  MemoryOnboardingResult,
  MemoryOnboardingPrompter,
} from "./onboarding.js";
