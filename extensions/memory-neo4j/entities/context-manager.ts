import { randomUUID } from "node:crypto";
import type {
  SessionEntityTracker,
  TrackedEntity,
  ExtractionResult,
  ExtractionEntity,
  MemoryNodeType,
} from "../types.js";

export class SessionContextManager {
  private sessions: Map<string, SessionEntityTracker> = new Map();
  private maxSessions = 100;
  private sessionTTL = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000); // Every hour
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, tracker] of this.sessions.entries()) {
      const lastActivity = Math.max(
        ...Array.from(tracker.knownEntities.values()).map((e) => e.lastMentionedAt)
      );
      if (now - lastActivity > this.sessionTTL) {
        this.sessions.delete(sessionId);
      }
    }
  }

  getOrCreate(sessionId: string, userName?: string): SessionEntityTracker {
    if (!this.sessions.has(sessionId)) {
      if (this.sessions.size >= this.maxSessions) {
        const oldestSession = this.sessions.keys().next().value;
        if (oldestSession) {
          this.sessions.delete(oldestSession);
        }
      }

      const tracker: SessionEntityTracker = {
        sessionId,
        knownEntities: new Map(),
        pronounMap: new Map([["我", "USER"]]),
        activeContext: {
          lastMentionedEntities: [],
        },
        pendingReferences: [],
      };

      if (userName) {
        const userEntity: TrackedEntity = {
          id: randomUUID(),
          name: userName,
          type: "Person" as MemoryNodeType,
          aliases: ["我", "USER"],
          lastMentionedAt: Date.now(),
          mentionCount: 1,
          attributes: new Map(),
          confidence: 1.0,
        };
        tracker.knownEntities.set(userName, userEntity);
        tracker.knownEntities.set("USER", userEntity);
        tracker.pronounMap.set("我", userName);
      }

      this.sessions.set(sessionId, tracker);
    }
    return this.sessions.get(sessionId)!;
  }

  get(sessionId: string): SessionEntityTracker | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  buildExtractionContext(tracker: SessionEntityTracker): string {
    const entities = Array.from(tracker.knownEntities.values())
      .filter((e) => e.name !== "USER")
      .map((e) => {
        const attrs =
          e.attributes.size > 0
            ? `, 属性: ${Array.from(e.attributes.entries())
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}`
            : "";
        const aliases = e.aliases.length > 0 ? ` 别名: ${e.aliases.join(", ")}` : "";
        return `- ${e.name} (${e.type})${aliases}${attrs}`;
      })
      .join("\n");

    const pronouns = Array.from(tracker.pronounMap.entries())
      .filter(([k]) => k !== "USER")
      .map(([k, v]) => `"${k}" → "${v}"`)
      .join(", ");

    const context = tracker.activeContext.projectId
      ? `当前项目: ${tracker.activeContext.projectId}`
      : "无特定项目上下文";

    const recentEntities = tracker.activeContext.lastMentionedEntities
      .slice(0, 5)
      .join(", ");

    return `已知实体:
${entities || "无"}

代词映射:
${pronouns || "无"}

${context}

最近提及: ${recentEntities || "无"}`;
  }

  updateTracker(
    tracker: SessionEntityTracker,
    extraction: ExtractionResult,
    userName?: string
  ): void {
    const now = Date.now();

    for (const entity of extraction.entities) {
      if (entity.action === "create") {
        const id = entity.id || randomUUID();
        const trackedEntity: TrackedEntity = {
          id,
          name: entity.name,
          type: entity.type,
          aliases: entity.aliases || [],
          lastMentionedAt: now,
          mentionCount: 1,
          attributes: new Map(Object.entries(entity.attributes || {})),
          confidence: entity.confidence,
        };
        tracker.knownEntities.set(entity.name, trackedEntity);

        for (const alias of entity.aliases || []) {
          tracker.knownEntities.set(alias, trackedEntity);
        }
      } else if (entity.action === "update" || entity.action === "reference") {
        const existing =
          tracker.knownEntities.get(entity.name) ||
          tracker.knownEntities.get(entity.id || "");

        if (existing) {
          existing.lastMentionedAt = now;
          existing.mentionCount++;
          existing.confidence = Math.max(existing.confidence, entity.confidence);

          if (entity.attributes) {
            for (const [k, v] of Object.entries(entity.attributes)) {
              existing.attributes.set(k, v);
            }
          }

          if (entity.aliases) {
            existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])];
            for (const alias of entity.aliases) {
              tracker.knownEntities.set(alias, existing);
            }
          }
        }
      }
    }

    if (extraction.pronounUpdates) {
      for (const [pronoun, name] of Object.entries(extraction.pronounUpdates)) {
        tracker.pronounMap.set(pronoun, name);
      }
    }

    if (extraction.contextUpdate?.projectId) {
      tracker.activeContext.projectId = extraction.contextUpdate.projectId;
    }

    if (extraction.contextUpdate?.topicId) {
      tracker.activeContext.topicId = extraction.contextUpdate.topicId;
    }

    const mentionedEntities = extraction.entities
      .filter((e) => e.action !== "create" || e.confidence >= 0.7)
      .map((e) => e.name);

    tracker.activeContext.lastMentionedEntities = [
      ...mentionedEntities,
      ...tracker.activeContext.lastMentionedEntities,
    ].slice(0, 10);
  }

  resolvePronoun(tracker: SessionEntityTracker, pronoun: string): string | undefined {
    return tracker.pronounMap.get(pronoun);
  }

  findEntityByAlias(tracker: SessionEntityTracker, nameOrAlias: string): TrackedEntity | undefined {
    return tracker.knownEntities.get(nameOrAlias);
  }

  getActiveProject(tracker: SessionEntityTracker): string | undefined {
    return tracker.activeContext.projectId;
  }

  setActiveProject(tracker: SessionEntityTracker, projectId: string): void {
    tracker.activeContext.projectId = projectId;
  }

  getRecentEntities(tracker: SessionEntityTracker, limit = 5): TrackedEntity[] {
    const entities = Array.from(tracker.knownEntities.values())
      .filter((e) => e.name !== "USER")
      .sort((a, b) => b.lastMentionedAt - a.lastMentionedAt)
      .slice(0, limit);

    return entities;
  }

  addPendingReference(
    tracker: SessionEntityTracker,
    text: string,
    possibleEntities: string[]
  ): void {
    tracker.pendingReferences.push({
      id: randomUUID(),
      text,
      possibleEntities,
      createdAt: Date.now(),
    });
  }

  resolvePendingReference(
    tracker: SessionEntityTracker,
    referenceId: string,
    resolvedEntity: string
  ): void {
    const index = tracker.pendingReferences.findIndex((r) => r.id === referenceId);
    if (index !== -1) {
      tracker.pendingReferences.splice(index, 1);
    }
  }

  clearPendingReferences(tracker: SessionEntityTracker): void {
    tracker.pendingReferences = [];
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

export const sessionContextManager = new SessionContextManager();
