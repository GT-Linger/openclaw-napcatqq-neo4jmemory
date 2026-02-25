import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { listSubagents } from "../subagent-manager.js";

const AvailableSubagentsSchema = Type.Object({
  category: Type.Optional(Type.String()),
});

export function createAvailableSubagentsTool(): AnyAgentTool {
  return {
    label: "AvailableSubagents",
    name: "available_subagents",
    description:
      "列出所有可用的子智能体及其专长。当需要使用子智能体时，先调用此工具查看有哪些可用的子智能体及其专长。",
    parameters: AvailableSubagentsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const categoryFilter = typeof params.category === "string" ? params.category : undefined;

      const allSubagents = listSubagents();

      let filtered = allSubagents;
      if (categoryFilter) {
        filtered = allSubagents.filter(
          (s) => s.metadata?.category?.toLowerCase() === categoryFilter.toLowerCase(),
        );
      }

      const subagentsList = filtered.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.metadata?.category || "general",
        tags: s.metadata?.tags || [],
        model: s.model.endpoint.model,
        provider: s.model.endpoint.provider,
        baseUrl: s.model.endpoint.baseUrl,
        hasPersonality: !!s.personality,
        hasWorkspace: !!s.workspaceDir,
      }));

      const categories = [...new Set(allSubagents.map((s) => s.metadata?.category || "general"))];

      const text = buildListText(subagentsList, categories);

      return jsonResult({
        status: "ok",
        total: subagentsList.length,
        categories,
        subagents: subagentsList,
        text,
      });
    },
  };
}

function buildListText(
  subagents: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    model: string;
    provider: string;
  }>,
  categories: string[],
): string {
  const lines: string[] = [];

  if (subagents.length === 0) {
    lines.push("没有可用的子智能体。");
    if (categories.length > 0) {
      lines.push("", `可用分类: ${categories.join(", ")}`);
    }
    return lines.join("\n");
  }

  lines.push(`可用子智能体 (共 ${subagents.length} 个):`, "-----");

  for (const s of subagents) {
    const tagsStr = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
    lines.push(
      `${s.name} (${s.category})${tagsStr}`,
      `  ID: ${s.id}`,
      `  描述: ${s.description}`,
      `  模型: ${s.model} (${s.provider})`,
      "",
    );
  }

  if (categories.length > 0) {
    lines.push(`-----`, `可用分类: ${categories.join(", ")}`);
  }

  return lines.join("\n");
}
