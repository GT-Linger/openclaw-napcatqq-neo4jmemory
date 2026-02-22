import type { MemoryNodeType, MemoryRelationType } from "../types.js";

export const QUERIES = {
  CREATE_ENTITY: `
    MERGE (n:MemoryNode {name: $name, type: $type})
    ON CREATE SET 
      n.id = randomUUID(),
      n.createdAt = timestamp(),
      n.confidence = $confidence,
      n.aliases = $aliases,
      n.attributes = $attributes,
      n.content = $content,
      n.source = $source,
      n.priority = $priority,
      n.lastAccessedAt = timestamp(),
      n.accessCount = 1
    ON MATCH SET
      n.updatedAt = timestamp(),
      n.lastAccessedAt = timestamp(),
      n.accessCount = n.accessCount + 1,
      n.confidence = CASE WHEN $confidence > n.confidence THEN $confidence ELSE n.confidence END,
      n.aliases = CASE 
        WHEN $aliases IS NOT NULL AND size($aliases) > 0
        THEN apoc.coll.toSet(coalesce(n.aliases, []) + $aliases) 
        ELSE n.aliases 
      END,
      n.content = CASE WHEN $content IS NOT NULL AND $content <> '' THEN $content ELSE n.content END,
      n.attributes = CASE
        WHEN $attributes IS NOT NULL AND $merge = true
        THEN apoc.convert.toJson(apoc.convert.fromJsonMap(coalesce(n.attributes, '{}')) + $attributes)
        WHEN $attributes IS NOT NULL
        THEN $attributes
        ELSE n.attributes
      END
    RETURN n
  `,

  UPDATE_ENTITY: `
    MATCH (n:MemoryNode {id: $id})
    SET n.updatedAt = timestamp(),
        n.lastAccessedAt = timestamp(),
        n.accessCount = n.accessCount + 1,
        n.content = CASE WHEN $content IS NOT NULL THEN $content ELSE n.content END,
        n.confidence = CASE WHEN $confidence IS NOT NULL THEN $confidence ELSE n.confidence END,
        n.aliases = CASE 
          WHEN $aliases IS NOT NULL 
          THEN apoc.coll.toSet(coalesce(n.aliases, []) + $aliases) 
          ELSE n.aliases 
        END,
        n.attributes = CASE
          WHEN $attributes IS NOT NULL
          THEN apoc.convert.toJson(apoc.convert.fromJsonMap(coalesce(n.attributes, '{}')) + $attributes)
          ELSE n.attributes
        END
    RETURN n
  `,

  GET_ENTITY_BY_ID: `
    MATCH (n:MemoryNode {id: $id})
    RETURN n
  `,

  GET_ENTITY_BY_NAME: `
    MATCH (n:MemoryNode {name: $name})
    RETURN n
  `,

  FIND_SIMILAR_ENTITY: `
    MATCH (n:MemoryNode)
    WHERE n.type = $type AND (
      n.name = $name OR 
      any(alias IN n.aliases WHERE alias = $name) OR
      any(alias IN $aliases WHERE alias = n.name)
    )
    RETURN n
    ORDER BY n.confidence DESC
    LIMIT 1
  `,

  SEARCH_ENTITIES: `
    CALL db.index.fulltext.queryNodes('memoryIndex', $query)
    YIELD node, score
    WHERE ($entityType IS NULL OR node.type = $entityType)
      AND node.confidence >= $minConfidence
    RETURN node, score
    ORDER BY score DESC, node.confidence DESC
    LIMIT $limit
  `,

  SEARCH_ENTITIES_FALLBACK: `
    MATCH (n:MemoryNode)
    WHERE (n.name CONTAINS $query OR n.content CONTAINS $query)
      AND ($entityType IS NULL OR n.type = $entityType)
      AND n.confidence >= $minConfidence
    RETURN n, 0.5 as score
    ORDER BY n.confidence DESC, n.lastAccessedAt DESC
    LIMIT $limit
  `,

  CREATE_RELATION: `
    MATCH (from:MemoryNode) 
    WHERE from.id = $fromId OR from.name = $fromName
    MATCH (to:MemoryNode) 
    WHERE to.id = $toId OR to.name = $toName
    MERGE (from)-[r:RELATES_TO {type: $relationType}]->(to)
    ON CREATE SET
      r.id = randomUUID(),
      r.createdAt = timestamp(),
      r.confidence = $confidence,
      r.context = $context,
      r.source = $source,
      r.priority = $priority
    ON MATCH SET
      r.updatedAt = timestamp(),
      r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END,
      r.context = CASE WHEN $context IS NOT NULL THEN $context ELSE r.context END
    RETURN r, from, to
  `,

  GET_RELATIONS: `
    MATCH (from:MemoryNode)-[r:RELATES_TO]->(to:MemoryNode)
    WHERE from.id = $entityId OR to.id = $entityId
    RETURN from, r, to
    ORDER BY r.confidence DESC
    LIMIT $limit
  `,

  MULTI_HOP_SEARCH: `
    MATCH path = (start:MemoryNode)-[r*1..$maxHops]-(end:MemoryNode)
    WHERE (start.name CONTAINS $query OR start.content CONTAINS $query)
      AND end.confidence >= $minConfidence
    RETURN path, end
    ORDER BY length(path), end.confidence DESC
    LIMIT $limit
  `,

  EXPAND_ENTITY: `
    MATCH (center:MemoryNode {id: $entityId})
    OPTIONAL MATCH (center)-[out:RELATES_TO]->(outNode:MemoryNode)
    OPTIONAL MATCH (center)<-[in:RELATES_TO]-(inNode:MemoryNode)
    RETURN center, 
           collect(DISTINCT {node: outNode, relation: out.type, direction: 'out'}) as outgoing,
           collect(DISTINCT {node: inNode, relation: in.type, direction: 'in'}) as incoming
  `,

  GET_PROJECT_CONTEXT: `
    MATCH (p:MemoryNode {type: 'Project', name: $projectName})
    OPTIONAL MATCH (p)<-[:RELATES_TO]-(entities:MemoryNode)
    WHERE entities.type IN ['Character', 'Event', 'Item', 'Concept']
    OPTIONAL MATCH (entities)-[r:RELATES_TO]->(related:MemoryNode)
    RETURN p, 
           collect(DISTINCT entities) as projectEntities,
           collect(DISTINCT {from: entities.name, to: related.name, type: r.type}) as relations
  `,

  TIME_RANGE_QUERY: `
    MATCH (n:MemoryNode)
    WHERE n.createdAt >= $start AND n.createdAt <= $end
    RETURN n
    ORDER BY n.createdAt DESC
    LIMIT $limit
  `,

  UPDATE_ACCESS_TIME: `
    MATCH (n:MemoryNode {id: $id})
    SET n.lastAccessedAt = timestamp(),
        n.accessCount = n.accessCount + 1
  `,

  DECAY_CONFIDENCE: `
    MATCH (n:MemoryNode)
    WHERE n.confidence > 0 AND n.lastAccessedAt < $threshold
    WITH n, 
         n.confidence * pow(0.5, toFloat(timestamp() - n.lastAccessedAt) / $halfLife) as newConfidence
    SET n.confidence = CASE 
      WHEN newConfidence < $minConfidence THEN $minConfidence 
      ELSE newConfidence 
    END
    RETURN count(n) as updated
  `,

  CLEANUP_LOW_CONFIDENCE: `
    MATCH (n:MemoryNode)
    WHERE n.confidence <= $minConfidence AND n.lastAccessedAt < $maxAge
    DETACH DELETE n
    RETURN count(n) as deleted
  `,

  CLEANUP_OLD_NODES: `
    MATCH (n:MemoryNode)
    WHERE n.createdAt < $maxAge AND n.accessCount < $minAccessCount
    DETACH DELETE n
    RETURN count(n) as deleted
  `,

  GET_ALL_ENTITIES: `
    MATCH (n:MemoryNode)
    RETURN n
    ORDER BY n.confidence DESC, n.lastAccessedAt DESC
    LIMIT $limit
  `,

  DELETE_ENTITY: `
    MATCH (n:MemoryNode {id: $id})
    DETACH DELETE n
    RETURN count(n) as deleted
  `,

  DELETE_RELATION: `
    MATCH ()-[r:RELATES_TO {id: $id}]-()
    DELETE r
    RETURN count(r) as deleted
  `,

  GET_ENTITY_HISTORY: `
    MATCH (n:MemoryNode {id: $id})
    RETURN n.history as history
  `,

  STORE_HISTORY: `
    MATCH (n:MemoryNode {id: $id})
    SET n.history = CASE 
      WHEN n.history IS NULL THEN [$changeRecord]
      ELSE n.history + $changeRecord
    END
    SET n.history = CASE
      WHEN size(n.history) > $maxLength
      THEN n.history[-$maxLength..]
      ELSE n.history
    END
  `,

  GET_RELATED_BY_TYPE: `
    MATCH (start:MemoryNode)-[r:RELATES_TO {type: $relationType}]-(end:MemoryNode)
    WHERE start.id = $entityId OR start.name = $entityName
    RETURN end, r
    ORDER BY r.confidence DESC
    LIMIT $limit
  `,

  COUNT_ENTITIES: `
    MATCH (n:MemoryNode)
    RETURN count(n) as count
  `,

  COUNT_RELATIONS: `
    MATCH ()-[r:RELATES_TO]->()
    RETURN count(r) as count
  `,
};

export function buildSearchQuery(params: {
  query: string;
  entityType?: MemoryNodeType;
  minConfidence: number;
  limit: number;
}): { query: string; params: Record<string, unknown> } {
  return {
    query: QUERIES.SEARCH_ENTITIES,
    params: {
      query: params.query,
      entityType: params.entityType ?? null,
      minConfidence: params.minConfidence,
      limit: params.limit,
    },
  };
}

export function buildMultiHopQuery(params: {
  query: string;
  maxHops: number;
  minConfidence: number;
  limit: number;
}): { query: string; params: Record<string, unknown> } {
  return {
    query: QUERIES.MULTI_HOP_SEARCH,
    params: {
      query: params.query,
      maxHops: params.maxHops,
      minConfidence: params.minConfidence,
      limit: params.limit,
    },
  };
}
