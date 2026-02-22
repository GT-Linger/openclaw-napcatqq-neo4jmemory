export type MemoryNodeType =
  | "Person"
  | "Place"
  | "Organization"
  | "Project"
  | "Character"
  | "Plot"
  | "Event"
  | "Item"
  | "Concept"
  | "Topic"
  | "Skill"
  | "Preference"
  | "Fact"
  | "Decision"
  | "Goal"
  | "Date";

export type MemoryRelationType =
  | "KNOWS"
  | "LOCATED_AT"
  | "HAPPENED_ON"
  | "PARTICIPATED_IN"
  | "PREFERS"
  | "DECIDED"
  | "RELATED_TO"
  | "FOLLOWED_BY"
  | "MENTIONED_WITH"
  | "WORKS_ON"
  | "HAS_SKILL"
  | "DEPENDS_ON"
  | "CONTRADICTS"
  | "UPDATES"
  | "BELONGS_TO"
  | "PART_OF"
  | "CHARACTER_OF"
  | "AUTHOR_OF"
  | "MENTIONED_IN"
  | "HAPPENS_IN"
  | "FOLLOWS"
  | "CAUSES"
  | "CONFLICTS_WITH"
  | "HAS_SUBPLOT"
  | "HAS_CHAPTER"
  | "HAS_ATTRIBUTE"
  | "EVENT_OF";

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  name: string;
  content: string;
  aliases: string[];
  embedding?: number[];
  confidence: number;
  priority: MemoryPriority;
  source: MemorySource;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  metadata: Record<string, unknown>;
}

export interface MemoryRelation {
  id: string;
  type: MemoryRelationType;
  fromId: string;
  toId: string;
  confidence: number;
  priority: MemoryPriority;
  source: MemorySource;
  context?: string;
  validFrom?: number;
  validUntil?: number;
  createdAt: number;
  updatedAt: number;
}

export type MemoryPriorityLevel = "critical" | "high" | "normal" | "low";

export interface MemoryPriority {
  level: MemoryPriorityLevel;
  factors: {
    userExplicitRequest: boolean;
    repeatedMention: number;
    emotionalIntensity: number;
    decisionRelated: boolean;
    preferenceRelated: boolean;
  };
}

export interface MemorySource {
  type: "conversation" | "document" | "explicit" | "inferred";
  sessionId?: string;
  messageId?: string;
  timestamp: number;
  model?: string;
}

export interface TrackedEntity {
  id: string;
  name: string;
  type: MemoryNodeType;
  aliases: string[];
  lastMentionedAt: number;
  mentionCount: number;
  attributes: Map<string, unknown>;
  confidence: number;
}

export interface SessionEntityTracker {
  sessionId: string;
  knownEntities: Map<string, TrackedEntity>;
  pronounMap: Map<string, string>;
  activeContext: {
    projectId?: string;
    topicId?: string;
    lastMentionedEntities: string[];
  };
  pendingReferences: PendingReference[];
}

export interface PendingReference {
  id: string;
  text: string;
  possibleEntities: string[];
  createdAt: number;
}

export interface ExtractionEntity {
  action: "create" | "update" | "reference";
  id?: string;
  type: MemoryNodeType;
  name: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  confidence: number;
}

export interface ExtractionRelation {
  from: string;
  to: string;
  type: MemoryRelationType;
  context?: string;
  attributes?: Record<string, unknown>;
  confidence: number;
}

export interface ExtractionResult {
  entities: ExtractionEntity[];
  relations: ExtractionRelation[];
  pronounUpdates?: Record<string, string>;
  contextUpdate?: {
    projectId?: string;
    topicId?: string;
  };
}

export interface MemorySearchResult {
  node: MemoryNode;
  score: number;
  path?: Array<{
    from: string;
    relation: string;
    to: string;
  }>;
  relatedNodes?: MemoryNode[];
}

export interface GraphSearchOptions {
  query: string;
  entityType?: MemoryNodeType;
  maxHops?: number;
  maxResults?: number;
  includeRelations?: boolean;
  minConfidence?: number;
  projectId?: string;
}

export interface MemoryConflict {
  type: "contradiction" | "update" | "ambiguity";
  existing: MemoryNode;
  new: Partial<MemoryNode>;
  field: string;
}

export interface ConflictResolution {
  action: "update" | "replace" | "pending" | "branch" | "ignore";
  reason: string;
  confidence?: number;
  preserveHistory?: boolean;
  question?: string;
  alternatives?: MemoryNode[];
}

export interface MemoryHistoryEntry {
  timestamp: number;
  action: "create" | "update" | "merge" | "delete";
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  model?: string;
}

export interface MemoryProvenance {
  source: MemorySource;
  history: MemoryHistoryEntry[];
  verification: {
    status: "unverified" | "user_confirmed" | "cross_validated" | "contradicted";
    verifiedAt?: number;
    verifiedBy?: string;
  };
}
