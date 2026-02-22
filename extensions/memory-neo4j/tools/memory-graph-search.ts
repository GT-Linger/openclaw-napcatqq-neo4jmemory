import { Type } from "@sinclair/typebox";
import type { GraphStore } from "../db/store.js";
import type { Neo4jMemoryConfig } from "../config.js";
import type { MemoryNodeType, MemorySearchResult } from "../types.js";

export function createMemoryGraphSearchTool(options: {
  graphStore: GraphStore;
  config: Neo4jMemoryConfig;
  sessionKey?: string;
}) {
  const { graphStore, config } = options;

  return {
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
  };
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
