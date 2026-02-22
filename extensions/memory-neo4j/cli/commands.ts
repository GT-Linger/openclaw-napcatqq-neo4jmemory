import type { Command } from "commander";
import type { Neo4jConnection } from "../db/connection.js";
import type { GraphStore } from "../db/store.js";
import type { Neo4jMemoryConfig } from "../config.js";

export function registerNeo4jCli(
  program: Command,
  connection: Neo4jConnection,
  graphStore: GraphStore,
  config: Neo4jMemoryConfig
): void {
  const mg = program
    .command("memory-graph")
    .alias("mg")
    .description("Neo4j 图谱记忆管理");

  mg.command("status")
    .description("显示图谱记忆状态")
    .option("-v, --verbose", "显示详细信息")
    .action(async (opts: { verbose?: boolean }) => {
      try {
        const health = await connection.healthCheck();
        const stats = await connection.getStats();
        const entityCount = await graphStore.countEntities();
        const relationCount = await graphStore.countRelations();

        console.log("\n图谱记忆状态:");
        console.log(`  连接状态: ${health.healthy ? "✓ 正常" : `✗ ${health.message}`}`);
        console.log(`  实体数量: ${entityCount}`);
        console.log(`  关系数量: ${relationCount}`);

        if (opts.verbose && Object.keys(stats.typeCounts).length > 0) {
          console.log("\n实体类型分布:");
          for (const [type, count] of Object.entries(stats.typeCounts)) {
            console.log(`  ${type}: ${count}`);
          }
        }

        console.log("");
      } catch (err) {
        console.error(`获取状态失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("search <query>")
    .description("搜索知识图谱")
    .option("-t, --type <type>", "按实体类型过滤")
    .option("-l, --limit <n>", "最大结果数", "20")
    .option("-j, --json", "输出 JSON 格式")
    .option("-r, --relations", "包含关联实体")
    .action(async (query: string, opts: { type?: string; limit?: string; json?: boolean; relations?: boolean }) => {
      try {
        const results = await graphStore.searchEntities({
          query,
          entityType: opts.type as never,
          maxResults: parseInt(opts.limit || "20"),
          includeRelations: opts.relations,
        });

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          if (results.length === 0) {
            console.log("未找到匹配的实体。");
            return;
          }

          console.log(`\n找到 ${results.length} 条结果:\n`);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const node = r.node;
            console.log(`${i + 1}. [${node.type}] ${node.name}`);
            if (node.content) {
              console.log(`   描述: ${node.content.slice(0, 100)}${node.content.length > 100 ? "..." : ""}`);
            }
            console.log(`   置信度: ${(node.confidence * 100).toFixed(0)}%`);
            console.log(`   ID: ${node.id}`);

            if (r.relatedNodes && r.relatedNodes.length > 0) {
              console.log(`   相关: ${r.relatedNodes.slice(0, 3).map((n) => n.name).join(", ")}`);
            }
            console.log("");
          }
        }
      } catch (err) {
        console.error(`搜索失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("entity <action>")
    .description("实体操作 (add|get|delete)")
    .option("-n, --name <name>", "实体名称")
    .option("-t, --type <type>", "实体类型", "Fact")
    .option("-c, --content <content>", "实体描述")
    .option("-a, --attributes <json>", "属性 (JSON 格式)")
    .action(async (action: string, opts: { name?: string; type?: string; content?: string; attributes?: string }) => {
      try {
        if (action === "add" && opts.name) {
          const entity = await graphStore.createEntity({
            type: opts.type as never,
            name: opts.name,
            content: opts.content,
            attributes: opts.attributes ? JSON.parse(opts.attributes) : undefined,
            confidence: 0.8,
          });
          console.log(`已创建实体: ${entity.name} (${entity.type})`);
          console.log(`ID: ${entity.id}`);
        } else if (action === "get" && opts.name) {
          const entity = await graphStore.getEntityByName(opts.name);
          if (entity) {
            console.log(JSON.stringify(entity, null, 2));
          } else {
            console.log("未找到实体。");
          }
        } else if (action === "delete" && opts.name) {
          const entity = await graphStore.getEntityByName(opts.name);
          if (entity) {
            const deleted = await graphStore.deleteEntity(entity.id);
            console.log(deleted ? `已删除实体: ${opts.name}` : "删除失败");
          } else {
            console.log("未找到实体。");
          }
        } else {
          console.log("用法: entity <add|get|delete> --name <名称>");
        }
      } catch (err) {
        console.error(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("relation <action>")
    .description("关系操作 (add)")
    .option("-f, --from <entity>", "源实体")
    .option("-t, --to <entity>", "目标实体")
    .option("-r, --relation <type>", "关系类型", "RELATED_TO")
    .action(async (action: string, opts: { from?: string; to?: string; relation?: string }) => {
      try {
        if (action === "add" && opts.from && opts.to) {
          const relation = await graphStore.createRelation({
            fromName: opts.from,
            toName: opts.to,
            type: opts.relation as never,
            confidence: 0.7,
          });
          if (relation) {
            console.log(`已创建关系: ${opts.from} -[${opts.relation}]-> ${opts.to}`);
          } else {
            console.log("创建关系失败：找不到实体。");
          }
        } else {
          console.log("用法: relation add --from <实体> --to <实体> --relation <类型>");
        }
      } catch (err) {
        console.error(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("visualize [entity]")
    .description("生成图谱可视化（Mermaid 格式）")
    .option("-d, --depth <n>", "遍历深度", "2")
    .action(async (entity: string | undefined, opts: { depth?: string }) => {
      try {
        let mermaid = "graph TD\n";

        if (entity) {
          const expanded = await graphStore.expandEntity(entity);
          mermaid += `  ${sanitizeId(expanded.node.name)}["${expanded.node.name} (${expanded.node.type})"]\n`;

          for (const related of expanded.related) {
            mermaid += `  ${sanitizeId(related.name)}["${related.name} (${related.type})"]\n`;
          }

          for (const path of expanded.path) {
            const arrow = path.relation ? `-->|${path.relation}|` : "-->";
            mermaid += `  ${sanitizeId(path.from)} ${arrow} ${sanitizeId(path.to)}\n`;
          }
        } else {
          const results = await graphStore.searchEntities({
            query: "*",
            maxResults: 20,
          });

          for (const r of results) {
            mermaid += `  ${sanitizeId(r.node.name)}["${r.node.name} (${r.node.type})"]\n`;
            if (r.relatedNodes) {
              for (const related of r.relatedNodes.slice(0, 3)) {
                mermaid += `  ${sanitizeId(related.name)}["${related.name} (${related.type})"]\n`;
                mermaid += `  ${sanitizeId(r.node.name)} --> ${sanitizeId(related.name)}\n`;
              }
            }
          }
        }

        console.log("\n```mermaid");
        console.log(mermaid);
        console.log("```\n");
      } catch (err) {
        console.error(`生成可视化失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("cleanup")
    .description("清理低置信度和过期节点")
    .option("--min-confidence <n>", "最小置信度阈值", "0.3")
    .option("--max-age-days <n>", "最大保留天数", "365")
    .option("--dry-run", "仅显示将被删除的内容")
    .action(async (opts: { minConfidence?: string; maxAgeDays?: string; dryRun?: boolean }) => {
      try {
        const minConfidence = parseFloat(opts.minConfidence || "0.3");
        const maxAge = parseInt(opts.maxAgeDays || "365") * 24 * 60 * 60 * 1000;

        if (opts.dryRun) {
          const entityCount = await graphStore.countEntities();
          console.log(`\n将删除置信度低于 ${minConfidence} 或超过 ${opts.maxAgeDays} 天未访问的节点`);
          console.log(`当前实体总数: ${entityCount}`);
        } else {
          const result = await graphStore.cleanupLowConfidence({
            minConfidence,
            maxAge: Date.now() - maxAge,
          });
          console.log(`已删除 ${result} 个节点`);
        }
      } catch (err) {
        console.error(`清理失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  mg.command("export")
    .description("导出图谱数据")
    .option("-f, --format <format>", "导出格式 (json|markdown)")
    .option("-o, --output <file>", "输出文件")
    .action(async (opts: { format?: string; output?: string }) => {
      try {
        const results = await graphStore.searchEntities({
          query: "*",
          maxResults: 1000,
        });

        const entities = results.map((r) => ({
          id: r.node.id,
          name: r.node.name,
          type: r.node.type,
          content: r.node.content,
          confidence: r.node.confidence,
          attributes: r.node.attributes,
          createdAt: r.node.createdAt,
        }));

        let output: string;

        if (opts.format === "json") {
          output = JSON.stringify(entities, null, 2);
        } else {
          output = "# 记忆导出\n\n";
          output += `导出时间: ${new Date().toISOString()}\n\n`;
          output += "## 实体列表\n\n";

          for (const e of entities) {
            output += `### ${e.name} (${e.type})\n`;
            output += `- 置信度: ${(e.confidence * 100).toFixed(0)}%\n`;
            output += `- 创建时间: ${new Date(e.createdAt).toISOString()}\n`;
            if (e.content) {
              output += `- 描述: ${e.content}\n`;
            }
            output += "\n";
          }
        }

        if (opts.output) {
          const fs = await import("node:fs/promises");
          await fs.writeFile(opts.output, output, "utf-8");
          console.log(`已导出到: ${opts.output}`);
        } else {
          console.log(output);
        }
      } catch (err) {
        console.error(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}
