import type { MemoryNode, MemoryConflict, ConflictResolution, MemoryPriorityLevel } from "../types.js";

export class ConflictResolver {
  private strategy: "ask-user" | "confidence-based" | "newest-wins";
  private preserveHistory: boolean;

  constructor(options?: {
    strategy?: "ask-user" | "confidence-based" | "newest-wins";
    preserveHistory?: boolean;
  }) {
    this.strategy = options?.strategy ?? "confidence-based";
    this.preserveHistory = options?.preserveHistory ?? true;
  }

  async resolve(conflict: MemoryConflict): Promise<ConflictResolution> {
    switch (this.strategy) {
      case "newest-wins":
        return this.resolveByTime(conflict);
      case "confidence-based":
        return this.resolveByConfidence(conflict);
      case "ask-user":
        return this.resolveByAsking(conflict);
      default:
        return this.resolveByConfidence(conflict);
    }
  }

  private resolveByTime(conflict: MemoryConflict): ConflictResolution {
    const existingTime = conflict.existing.updatedAt || conflict.existing.createdAt;
    const newTime = conflict.new.updatedAt || conflict.new.createdAt || Date.now();

    if (newTime >= existingTime) {
      return {
        action: "update",
        reason: "newer information supersedes old",
        confidence: Math.max(conflict.existing.confidence, conflict.new.confidence || 0.5),
        preserveHistory: this.preserveHistory,
      };
    }

    return {
      action: "ignore",
      reason: "existing information is newer",
    };
  }

  private resolveByConfidence(conflict: MemoryConflict): ConflictResolution {
    const existingConf = conflict.existing.confidence;
    const newConf = conflict.new.confidence || 0.5;

    if (conflict.type === "update") {
      return {
        action: "update",
        reason: "information update",
        confidence: Math.max(existingConf, newConf),
        preserveHistory: this.preserveHistory,
      };
    }

    if (conflict.type === "contradiction") {
      if (newConf > existingConf + 0.2) {
        return {
          action: "replace",
          reason: "new information has significantly higher confidence",
          preserveHistory: this.preserveHistory,
        };
      }

      if (existingConf > newConf + 0.2) {
        return {
          action: "ignore",
          reason: "existing information has significantly higher confidence",
        };
      }

      return {
        action: "pending",
        reason: "conflict requires user confirmation",
        question: `发现记忆冲突：之前记录"${conflict.existing.content}"，现在您说"${conflict.new.content}"，哪个是正确的？`,
      };
    }

    if (conflict.type === "ambiguity") {
      return {
        action: "branch",
        reason: "ambiguous reference, create alternatives",
        alternatives: [conflict.existing],
      };
    }

    return {
      action: "update",
      reason: "default resolution",
      confidence: Math.max(existingConf, newConf),
    };
  }

  private resolveByAsking(conflict: MemoryConflict): ConflictResolution {
    if (conflict.type === "update") {
      return {
        action: "update",
        reason: "information update",
        preserveHistory: this.preserveHistory,
      };
    }

    return {
      action: "pending",
      reason: "conflict requires user confirmation",
      question: this.generateQuestion(conflict),
    };
  }

  private generateQuestion(conflict: MemoryConflict): string {
    const field = conflict.field;
    const existing = conflict.existing;
    const newVal = conflict.new;

    switch (field) {
      case "content":
        return `关于"${existing.name}"，之前记录的是"${existing.content}"，现在您说"${newVal.content}"，哪个是正确的？`;
      case "attributes":
        return `关于"${existing.name}"的属性有冲突，之前记录的是${JSON.stringify(existing.attributes)}，现在您说${JSON.stringify(newVal.attributes)}，如何处理？`;
      default:
        return `关于"${existing.name}"的信息有冲突，请确认哪个是正确的？`;
    }
  }

  detectConflict(existing: MemoryNode, newInfo: Partial<MemoryNode>): MemoryConflict | null {
    if (newInfo.content && existing.content && newInfo.content !== existing.content) {
      const isContradiction = this.isContradiction(existing.content, newInfo.content);

      return {
        type: isContradiction ? "contradiction" : "update",
        existing,
        new: newInfo,
        field: "content",
      };
    }

    if (newInfo.attributes && existing.attributes) {
      const conflicts = this.findAttributeConflicts(existing.attributes, newInfo.attributes);
      if (conflicts.length > 0) {
        return {
          type: "contradiction",
          existing,
          new: newInfo,
          field: "attributes",
        };
      }
    }

    return null;
  }

  private isContradiction(existing: string, newContent: string): boolean {
    const contradictionPatterns = [
      { pattern: /是(\w+)/, negate: /不是(\w+)/ },
      { pattern: /有(\w+)/, negate: /没有(\w+)/ },
      { pattern: /(\d+)岁/, negate: /不是(\d+)岁/ },
    ];

    for (const { pattern, negate } of contradictionPatterns) {
      const existingMatch = existing.match(pattern);
      const newMatch = newContent.match(pattern);
      const existingNegate = existing.match(negate);
      const newNegate = newContent.match(negate);

      if (existingMatch && newNegate && existingMatch[1] === newNegate[1]) {
        return true;
      }
      if (existingNegate && newMatch && existingNegate[1] === newMatch[1]) {
        return true;
      }
    }

    return false;
  }

  private findAttributeConflicts(
    existing: Record<string, unknown>,
    newAttrs: Record<string, unknown>
  ): string[] {
    const conflicts: string[] = [];

    for (const [key, value] of Object.entries(newAttrs)) {
      if (existing[key] !== undefined && existing[key] !== value) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }
}

export class PriorityManager {
  private criticalKeywords: string[];
  private highKeywords: string[];

  constructor(options?: { criticalKeywords?: string[]; highKeywords?: string[] }) {
    this.criticalKeywords = options?.criticalKeywords || [
      "必须",
      "重要",
      "关键",
      "critical",
      "important",
      "must",
    ];
    this.highKeywords = options?.highKeywords || [
      "记住",
      "记得",
      "记住这个",
      "remember",
      "save",
    ];
  }

  calculatePriority(params: {
    text?: string;
    userExplicitRequest?: boolean;
    repeatedMention?: number;
    decisionRelated?: boolean;
    preferenceRelated?: boolean;
  }): { level: MemoryPriorityLevel; factors: Record<string, unknown> } {
    const factors = {
      userExplicitRequest: params.userExplicitRequest ?? false,
      repeatedMention: params.repeatedMention ?? 0,
      emotionalIntensity: 0,
      decisionRelated: params.decisionRelated ?? false,
      preferenceRelated: params.preferenceRelated ?? false,
    };

    if (params.text) {
      if (this.criticalKeywords.some((k) => params.text!.toLowerCase().includes(k.toLowerCase()))) {
        factors.emotionalIntensity = 1;
      } else if (this.highKeywords.some((k) => params.text!.toLowerCase().includes(k.toLowerCase()))) {
        factors.emotionalIntensity = 0.5;
      }
    }

    let level: MemoryPriorityLevel = "normal";

    if (factors.userExplicitRequest || factors.emotionalIntensity >= 1 || factors.decisionRelated) {
      level = "critical";
    } else if (factors.emotionalIntensity >= 0.5 || factors.repeatedMention >= 3 || factors.preferenceRelated) {
      level = "high";
    } else if (factors.repeatedMention === 0 && !factors.decisionRelated && !factors.preferenceRelated) {
      level = "low";
    }

    return { level, factors };
  }

  shouldNeverDecay(priority: { level: MemoryPriorityLevel }): boolean {
    return priority.level === "critical";
  }

  getDecayMultiplier(priority: { level: MemoryPriorityLevel }): number {
    switch (priority.level) {
      case "critical":
        return 0;
      case "high":
        return 0.1;
      case "normal":
        return 1;
      case "low":
        return 2;
    }
  }

  getRecallPriority(priority: { level: MemoryPriorityLevel }): number {
    switch (priority.level) {
      case "critical":
        return 100;
      case "high":
        return 10;
      case "normal":
        return 5;
      case "low":
        return 1;
    }
  }
}
