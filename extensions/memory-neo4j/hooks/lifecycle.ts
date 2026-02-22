import type { Neo4jMemoryConfig } from "../config.js";
import type { GraphStore } from "../db/store.js";
import type { EntityExtractor, LLMProvider } from "../entities/extractor.js";
import type { RelationExtractor } from "../relations/extractor.js";
import type { ExtractionResult } from "../types.js";
import { SessionContextManager } from "../entities/context-manager.js";
import { detectExtractionTriggers } from "../entities/extractor.js";

export interface AutoExtractHookOptions {
  config: Neo4jMemoryConfig;
  graphStore: GraphStore;
  entityExtractor: EntityExtractor;
  relationExtractor: RelationExtractor;
  contextManager: SessionContextManager;
  llm: LLMProvider;
}

export interface AgentEndEvent {
  success: boolean;
  messages?: unknown[];
  sessionId?: string;
  userId?: string;
  userName?: string;
}

export interface BeforeAgentStartEvent {
  prompt?: string;
  sessionId?: string;
  userId?: string;
  userName?: string;
}

export function setupAutoExtractHook(
  api: {
    logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
    on: (event: string, handler: (event: unknown) => Promise<unknown>) => void;
  },
  options: AutoExtractHookOptions
): void {
  const { config, graphStore, entityExtractor, contextManager } = options;

  if (!config.lifecycle?.autoCapture) {
    return;
  }

  api.on("agent_end", async (event: unknown) => {
    const agentEvent = event as AgentEndEvent;
    if (!agentEvent.success || !agentEvent.messages) {
      return;
    }

    const userMessages = extractUserMessages(agentEvent.messages);
    if (userMessages.length === 0) {
      return;
    }

    const sessionId = agentEvent.sessionId || "default";

    for (const msg of userMessages) {
      if (!shouldExtract(msg, config)) {
        continue;
      }

      try {
        const extraction = await entityExtractor.extract(msg, sessionId, {
          userName: agentEvent.userName,
        });

        if (extraction.entities.length > 0 || extraction.relations.length > 0) {
          await storeExtraction(graphStore, extraction, sessionId);

          api.logger.info("memory-neo4j: auto-extracted", {
            entities: extraction.entities.length,
            relations: extraction.relations.length,
            sessionId,
          });
        }
      } catch (err) {
        api.logger.warn("memory-neo4j: auto-extract failed", {
          error: String(err),
        });
      }
    }
  });
}

export function setupContextInjectHook(
  api: {
    logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
    on: (event: string, handler: (event: unknown) => Promise<unknown>) => void;
  },
  options: {
    config: Neo4jMemoryConfig;
    graphStore: GraphStore;
    contextManager: SessionContextManager;
  }
): void {
  const { config, graphStore, contextManager } = options;

  if (!config.lifecycle?.autoRecall) {
    return;
  }

  api.on("before_agent_start", async (event: unknown) => {
    const agentEvent = event as BeforeAgentStartEvent;
    if (!agentEvent.prompt || agentEvent.prompt.length < 5) {
      return;
    }

    const sessionId = agentEvent.sessionId || "default";

    try {
      const relevantEntities = await findRelevantEntities(
        graphStore,
        agentEvent.prompt,
        config.lifecycle?.recallLimit ?? 5
      );

      if (relevantEntities.length === 0) {
        return;
      }

      const contextBlock = formatEntitiesAsContext(relevantEntities);

      api.logger.info("memory-neo4j: injecting graph context", {
        count: relevantEntities.length,
        sessionId,
      });

      return {
        prependContext: contextBlock,
      };
    } catch (err) {
      api.logger.warn("memory-neo4j: context inject failed", {
        error: String(err),
      });
    }
  });
}

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

function shouldExtract(text: string, config: Neo4jMemoryConfig): boolean {
  if (config.extraction?.mode === "manual") {
    return false;
  }

  if (text.length < 10 || text.length > (config.extraction?.maxChars ?? 2000)) {
    return false;
  }

  if (config.extraction?.mode === "auto") {
    return true;
  }

  return detectExtractionTriggers(text);
}

async function storeExtraction(
  graphStore: GraphStore,
  extraction: ExtractionResult,
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

async function findRelevantEntities(
  graphStore: GraphStore,
  query: string,
  limit: number
) {
  const results = await graphStore.searchEntities({
    query,
    maxResults: limit,
    includeRelations: true,
  });

  return results.map((r) => r.node);
}

function formatEntitiesAsContext(entities: Array<{ name: string; type: string; content?: string; attributes?: Record<string, unknown> }>): string {
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
