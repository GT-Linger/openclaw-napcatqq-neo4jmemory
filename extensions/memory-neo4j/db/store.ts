import { randomUUID } from "node:crypto";
import type { Neo4jConnection } from "./connection.js";
import { QUERIES } from "./queries.js";
import type {
  MemoryNode,
  MemoryRelation,
  MemoryNodeType,
  MemoryRelationType,
  MemorySearchResult,
  GraphSearchOptions,
  MemorySource,
  MemoryPriorityLevel,
  MemoryHistoryEntry,
} from "../types.js";

function generateId(): string {
  return randomUUID();
}

function parseNeo4jNode(record: Record<string, unknown>): MemoryNode {
  const props = record.properties || record;
  return {
    id: props.id,
    type: props.type,
    name: props.name,
    content: props.content || "",
    aliases: props.aliases || [],
    embedding: props.embedding,
    confidence: props.confidence,
    priority: typeof props.priority === "string" ? JSON.parse(props.priority) : props.priority || { level: "normal", factors: {} },
    source: typeof props.source === "string" ? JSON.parse(props.source) : props.source || {},
    attributes: typeof props.attributes === "string" ? JSON.parse(props.attributes) : props.attributes || {},
    createdAt: typeof props.createdAt?.toNumber === "function" ? props.createdAt.toNumber() : props.createdAt,
    updatedAt: typeof props.updatedAt?.toNumber === "function" ? props.updatedAt.toNumber() : props.updatedAt,
    lastAccessedAt: typeof props.lastAccessedAt?.toNumber === "function" ? props.lastAccessedAt.toNumber() : props.lastAccessedAt,
    accessCount: typeof props.accessCount?.toNumber === "function" ? props.accessCount.toNumber() : props.accessCount || 0,
    metadata: typeof props.metadata === "string" ? JSON.parse(props.metadata) : props.metadata || {},
  };
}

function parseNeo4jRelation(record: Record<string, unknown>): MemoryRelation {
  const props = record.properties || record;
  return {
    id: props.id,
    type: props.type,
    fromId: props.fromId,
    toId: props.toId,
    confidence: props.confidence,
    priority: typeof props.priority === "string" ? JSON.parse(props.priority) : props.priority || { level: "normal", factors: {} },
    source: typeof props.source === "string" ? JSON.parse(props.source) : props.source || {},
    context: props.context,
    validFrom: props.validFrom,
    validUntil: props.validUntil,
    createdAt: typeof props.createdAt?.toNumber === "function" ? props.createdAt.toNumber() : props.createdAt,
    updatedAt: typeof props.updatedAt?.toNumber === "function" ? props.updatedAt.toNumber() : props.updatedAt,
  };
}

export class GraphStore {
  constructor(private connection: Neo4jConnection) {}

  async createEntity(params: {
    type: MemoryNodeType;
    name: string;
    content?: string;
    aliases?: string[];
    attributes?: Record<string, unknown>;
    confidence: number;
    priority?: { level: MemoryPriorityLevel; factors?: Record<string, unknown> };
    source?: MemorySource;
    merge?: boolean;
  }): Promise<MemoryNode> {
    const id = generateId();
    const now = Date.now();

    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.CREATE_ENTITY, {
        name: params.name,
        type: params.type,
        content: params.content || "",
        confidence: params.confidence,
        aliases: params.aliases || [],
        attributes: JSON.stringify(params.attributes || {}),
        source: JSON.stringify(params.source || { type: "explicit", timestamp: now }),
        priority: JSON.stringify(params.priority || { level: "normal", factors: {} }),
        merge: params.merge ?? true,
      });

      if (result.records.length === 0) {
        throw new Error("Failed to create entity");
      }

      return parseNeo4jNode(result.records[0].get("n"));
    });
  }

  async updateEntity(
    id: string,
    params: {
      content?: string;
      aliases?: string[];
      attributes?: Record<string, unknown>;
      confidence?: number;
    }
  ): Promise<MemoryNode | null> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.UPDATE_ENTITY, {
        id,
        content: params.content,
        aliases: params.aliases,
        attributes: params.attributes ? JSON.stringify(params.attributes) : null,
        confidence: params.confidence,
      });

      if (result.records.length === 0) {
        return null;
      }

      return parseNeo4jNode(result.records[0].get("n"));
    });
  }

  async getEntityById(id: string): Promise<MemoryNode | null> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.GET_ENTITY_BY_ID, { id });
      if (result.records.length === 0) {
        return null;
      }
      return parseNeo4jNode(result.records[0].get("n"));
    });
  }

  async getEntityByName(name: string): Promise<MemoryNode | null> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.GET_ENTITY_BY_NAME, { name });
      if (result.records.length === 0) {
        return null;
      }
      return parseNeo4jNode(result.records[0].get("n"));
    });
  }

  async findSimilarEntity(
    name: string,
    type: MemoryNodeType,
    aliases?: string[]
  ): Promise<MemoryNode | null> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.FIND_SIMILAR_ENTITY, {
        name,
        type,
        aliases: aliases || [],
      });
      if (result.records.length === 0) {
        return null;
      }
      return parseNeo4jNode(result.records[0].get("n"));
    });
  }

  async searchEntities(options: GraphSearchOptions): Promise<MemorySearchResult[]> {
    return this.connection.withSession(async (session) => {
      let result;
      try {
        result = await session.run(QUERIES.SEARCH_ENTITIES, {
          query: options.query,
          entityType: options.entityType ?? null,
          minConfidence: options.minConfidence ?? 0.5,
          limit: options.maxResults ?? 20,
        });
      } catch {
        result = await session.run(QUERIES.SEARCH_ENTITIES_FALLBACK, {
          query: options.query,
          entityType: options.entityType ?? null,
          minConfidence: options.minConfidence ?? 0.5,
          limit: options.maxResults ?? 20,
        });
      }

      const results: MemorySearchResult[] = [];
      for (const record of result.records) {
        const node = parseNeo4jNode(record.get("node"));
        const score = record.get("score");
        results.push({
          node,
          score: typeof score?.toNumber === "function" ? score.toNumber() : score,
        });
      }

      if (options.includeRelations !== false && results.length > 0) {
        for (const r of results.slice(0, 5)) {
          const expanded = await this.expandEntity(r.node.id);
          r.relatedNodes = expanded.related;
          r.path = expanded.path;
        }
      }

      return results;
    });
  }

  async multiHopSearch(options: GraphSearchOptions): Promise<MemorySearchResult[]> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.MULTI_HOP_SEARCH, {
        query: options.query,
        maxHops: options.maxHops ?? 3,
        minConfidence: options.minConfidence ?? 0.5,
        limit: options.maxResults ?? 20,
      });

      const results: MemorySearchResult[] = [];
      const seen = new Set<string>();

      for (const record of result.records) {
        const node = parseNeo4jNode(record.get("end"));
        if (seen.has(node.id)) continue;
        seen.add(node.id);

        const path = record.get("path");
        const pathInfo = this.extractPathInfo(path);

        results.push({
          node,
          score: 1 / (pathInfo.length + 1),
          path: pathInfo.segments,
        });
      }

      return results;
    });
  }

  private extractPathInfo(path: unknown): { length: number; segments: MemorySearchResult["path"] } {
    if (!path) return { length: 0, segments: [] };

    const segments: MemorySearchResult["path"] = [];
    let length = 0;

    try {
      const pathObj = path as { segments?: unknown[]; length?: number };
      length = pathObj.length ?? 0;

      if (pathObj.segments) {
        for (const seg of pathObj.segments) {
          const segObj = seg as {
            start?: { properties?: { name?: string } };
            relationship?: { properties?: { type?: string } };
            end?: { properties?: { name?: string } };
          };
          segments.push({
            from: segObj.start?.properties?.name || "",
            relation: segObj.relationship?.properties?.type || "",
            to: segObj.end?.properties?.name || "",
          });
        }
      }
    } catch {
      // ignore parsing errors
    }

    return { length, segments };
  }

  async expandEntity(entityId: string): Promise<{ node: MemoryNode; related: MemoryNode[]; path: MemorySearchResult["path"] }> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.EXPAND_ENTITY, { entityId });

      if (result.records.length === 0) {
        throw new Error("Entity not found");
      }

      const record = result.records[0];
      const node = parseNeo4jNode(record.get("center"));
      const outgoing = record.get("outgoing") || [];
      const incoming = record.get("incoming") || [];

      const related: MemoryNode[] = [];
      const path: MemorySearchResult["path"] = [];

      for (const rel of outgoing) {
        if (rel.node) {
          related.push(parseNeo4jNode(rel.node));
          path.push({
            from: node.name,
            relation: rel.relation,
            to: rel.node.properties?.name || "",
          });
        }
      }

      for (const rel of incoming) {
        if (rel.node) {
          related.push(parseNeo4jNode(rel.node));
          path.push({
            from: rel.node.properties?.name || "",
            relation: rel.relation,
            to: node.name,
          });
        }
      }

      return { node, related, path };
    });
  }

  async createRelation(params: {
    fromId?: string;
    fromName?: string;
    toId?: string;
    toName?: string;
    type: MemoryRelationType;
    context?: string;
    confidence: number;
    priority?: { level: MemoryPriorityLevel; factors?: Record<string, unknown> };
    source?: MemorySource;
  }): Promise<MemoryRelation | null> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.CREATE_RELATION, {
        fromId: params.fromId,
        fromName: params.fromName,
        toId: params.toId,
        toName: params.toName,
        relationType: params.type,
        confidence: params.confidence,
        context: params.context,
        source: JSON.stringify(params.source || { type: "inferred", timestamp: Date.now() }),
        priority: JSON.stringify(params.priority || { level: "normal", factors: {} }),
      });

      if (result.records.length === 0) {
        return null;
      }

      return parseNeo4jRelation(result.records[0].get("r"));
    });
  }

  async getRelations(entityId: string, limit = 20): Promise<MemoryRelation[]> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.GET_RELATIONS, { entityId, limit });
      return result.records.map((r) => parseNeo4jRelation(r.get("r")));
    });
  }

  async deleteEntity(id: string): Promise<boolean> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.DELETE_ENTITY, { id });
      return (result.records[0]?.get("deleted")?.toNumber?.() ?? 0) > 0;
    });
  }

  async deleteRelation(id: string): Promise<boolean> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.DELETE_RELATION, { id });
      return (result.records[0]?.get("deleted")?.toNumber?.() ?? 0) > 0;
    });
  }

  async getProjectContext(projectName: string): Promise<{
    project: MemoryNode | null;
    entities: MemoryNode[];
    relations: Array<{ from: string; to: string; type: string }>;
  }> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.GET_PROJECT_CONTEXT, { projectName });

      if (result.records.length === 0) {
        return { project: null, entities: [], relations: [] };
      }

      const record = result.records[0];
      const project = record.get("p") ? parseNeo4jNode(record.get("p")) : null;
      const entities = (record.get("projectEntities") || [])
        .filter((e: unknown) => e)
        .map((e: unknown) => parseNeo4jNode(e as Record<string, unknown>));
      const relations = (record.get("relations") || []).filter((r: unknown) => r);

      return { project, entities, relations };
    });
  }

  async decayConfidence(params: {
    threshold: number;
    halfLife: number;
    minConfidence: number;
  }): Promise<number> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.DECAY_CONFIDENCE, params);
      return result.records[0]?.get("updated")?.toNumber?.() ?? 0;
    });
  }

  async cleanupLowConfidence(params: {
    minConfidence: number;
    maxAge: number;
  }): Promise<number> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.CLEANUP_LOW_CONFIDENCE, params);
      return result.records[0]?.get("deleted")?.toNumber?.() ?? 0;
    });
  }

  async cleanupOldNodes(params: {
    maxAge: number;
    minAccessCount: number;
  }): Promise<number> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.CLEANUP_OLD_NODES, params);
      return result.records[0]?.get("deleted")?.toNumber?.() ?? 0;
    });
  }

  async storeHistory(
    entityId: string,
    changeRecord: MemoryHistoryEntry,
    maxLength: number
  ): Promise<void> {
    await this.connection.withSession(async (session) => {
      await session.run(QUERIES.STORE_HISTORY, {
        id: entityId,
        changeRecord: JSON.stringify(changeRecord),
        maxLength,
      });
    });
  }

  async getEntityHistory(entityId: string): Promise<MemoryHistoryEntry[]> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.GET_ENTITY_HISTORY, { id: entityId });
      const history = result.records[0]?.get("history");
      if (!history) return [];
      return (typeof history === "string" ? JSON.parse(history) : history) as MemoryHistoryEntry[];
    });
  }

  async countEntities(): Promise<number> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.COUNT_ENTITIES);
      return result.records[0]?.get("count")?.toNumber?.() ?? 0;
    });
  }

  async countRelations(): Promise<number> {
    return this.connection.withSession(async (session) => {
      const result = await session.run(QUERIES.COUNT_RELATIONS);
      return result.records[0]?.get("count")?.toNumber?.() ?? 0;
    });
  }
}
