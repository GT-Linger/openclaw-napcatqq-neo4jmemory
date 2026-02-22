import type { Neo4jMemoryConfig } from "../config.js";
import type { GraphStore } from "../db/store.js";
import type {
  ExtractionResult,
  ExtractionEntity,
  ExtractionRelation,
  MemoryNodeType,
  MemoryRelationType,
  SessionEntityTracker,
} from "../types.js";
import { SessionContextManager } from "./context-manager.js";

const EXTRACTION_PROMPT = `你是一个专业的信息提取系统，负责从对话中识别实体和关系。

## 任务
分析输入文本，提取结构化信息，并与已有记忆进行关联。

## 实体类型
- Person: 真实人物
- Character: 虚构角色（小说、游戏等中的角色）
- Project: 项目或作品（小说、游戏、应用等）
- Place: 地点
- Organization: 组织
- Event: 事件
- Item: 物品或道具
- Concept: 概念或主题
- Preference: 偏好
- Fact: 事实
- Decision: 决策
- Goal: 目标

## 关系类型
- KNOWS: 认识
- LOCATED_AT: 位于
- HAPPENED_ON: 发生于
- PARTICIPATED_IN: 参与
- PREFERS: 偏好
- DECIDED: 决定
- RELATED_TO: 相关
- BELONGS_TO: 属于
- CHARACTER_OF: 是...的角色
- AUTHOR_OF: 是...的作者
- HAPPENS_IN: 发生在...中
- FOLLOWS: 跟随/后续
- CAUSES: 导致
- CONFLICTS_WITH: 冲突
- HAS_ATTRIBUTE: 拥有属性
- EVENT_OF: 是...的事件

## 提取规则
1. 代词消解：根据上下文确定代词指代的实体
2. 实体链接：识别对已知实体的引用
3. 属性合并：新属性应合并到已有实体
4. 项目上下文：如果当前有活跃项目，新实体应关联到该项目
5. 置信度：根据信息明确程度设置 0.0-1.0

## 当前会话上下文
{sessionContext}

## 已有记忆图谱片段
{existingGraph}

## 新消息
用户: {newMessage}

## 输出格式 (仅输出JSON，不要其他内容)
{
  "entities": [
    {
      "action": "create|update|reference",
      "id": "如果引用已知实体，使用已知ID；否则留空",
      "type": "实体类型",
      "name": "规范名称（不要用代词）",
      "aliases": ["别名"],
      "attributes": {"属性名": "属性值"},
      "confidence": 0.0-1.0
    }
  ],
  "relations": [
    {
      "from": "源实体名称",
      "to": "目标实体名称",
      "type": "关系类型",
      "context": "关系上下文",
      "confidence": 0.0-1.0
    }
  ],
  "pronounUpdates": {
    "代词": "实体名称"
  },
  "contextUpdate": {
    "projectId": "如果消息涉及特定项目"
  }
}`;

const QUICK_EXTRACTION_PROMPT = `快速提取对话中的关键实体。仅输出JSON。

输入: {input}

输出格式:
{
  "entities": [{"type": "类型", "name": "名称", "confidence": 0.0-1.0}],
  "relations": [{"from": "源", "to": "目标", "type": "关系类型"}],
  "needsDeepAnalysis": true/false
}`;

const DEEP_EXTRACTION_PROMPT = `深度分析以下对话，提取完整的实体关系网络。

## 完整上下文
{fullContext}

## 待分析消息
{message}

## 任务
1. 消歧：解决代词引用和同名实体
2. 关联：识别与已有实体的关系
3. 推理：推断隐含关系
4. 验证：确认提取的准确性

输出JSON格式:
{
  "entities": [...],
  "relations": [...],
  "inferredRelations": [...],
  "confidence": 0.0-1.0
}`;

export interface LLMProvider {
  complete(params: {
    provider: string;
    model: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ text: string }>;
  getMainModel?(): { provider: string; model: string } | null;
}

export interface HybridExtractionConfig {
  quickModel: { provider: string; model: string };
  deepModel: { provider: string; model: string } | null;
  triggerThresholds: {
    entityCount: number;
    relationCount: number;
    keywords: string[];
  };
  asyncDeepExtraction: boolean;
}

export type ExtractionCallback = (
  sessionId: string,
  result: ExtractionResult
) => Promise<void>;

export class EntityExtractor {
  private deepExtractionQueue: Array<{
    message: string;
    sessionId: string;
    quickResult: ExtractionResult;
    timestamp: number;
  }> = [];
  private processingDeepQueue = false;
  private callbacks: ExtractionCallback[] = [];

  constructor(
    private config: Neo4jMemoryConfig,
    private graphStore: GraphStore,
    private contextManager: SessionContextManager,
    private llm: LLMProvider
  ) {}

  onDeepExtractionComplete(callback: ExtractionCallback): void {
    this.callbacks.push(callback);
  }

  async extract(
    message: string,
    sessionId: string,
    options?: {
      userName?: string;
      skipContext?: boolean;
      forceDeep?: boolean;
    }
  ): Promise<ExtractionResult> {
    if (message.length < 10 || message.length > (this.config.extraction?.maxChars ?? 2000)) {
      return { entities: [], relations: [] };
    }

    const strategy = this.config.models?.strategy ?? "hybrid";

    if (strategy === "same-as-main" || options?.forceDeep) {
      return this.deepExtract(message, sessionId, options);
    }

    if (strategy === "independent") {
      return this.independentExtract(message, sessionId, options);
    }

    return this.hybridExtract(message, sessionId, options);
  }

  private async hybridExtract(
    message: string,
    sessionId: string,
    options?: { userName?: string; skipContext?: boolean }
  ): Promise<ExtractionResult> {
    const quickResult = await this.quickExtract(message, sessionId, options);

    if (this.shouldTriggerDeepExtraction(message, quickResult)) {
      const deepConfig = this.config.models?.extraction?.deep;

      if (deepConfig?.enabled && this.config.models?.extraction?.quick?.enabled) {
        if (this.config.extraction?.mode === "hybrid") {
          this.scheduleDeepExtraction(message, sessionId, quickResult);
          return quickResult;
        }

        return this.deepExtract(message, sessionId, options);
      }
    }

    return quickResult;
  }

  private async quickExtract(
    message: string,
    sessionId: string,
    options?: { userName?: string }
  ): Promise<ExtractionResult> {
    const tracker = this.contextManager.getOrCreate(sessionId, options?.userName);
    const graphContext = await this.getRelevantGraphContext(message, tracker);

    const prompt = EXTRACTION_PROMPT.replace(
      "{sessionContext}",
      this.contextManager.buildExtractionContext(tracker)
    )
      .replace("{existingGraph}", graphContext)
      .replace("{newMessage}", message);

    const quickConfig = this.config.models?.extraction?.quick;

    let provider = quickConfig?.provider;
    let model = quickConfig?.model;

    if (!provider || !model) {
      if (this.llm.getMainModel) {
        const mainModel = this.llm.getMainModel();
        if (mainModel) {
          provider = provider ?? mainModel.provider;
          model = model ?? mainModel.model;
        }
      }
    }

    provider = provider ?? "openai";
    model = model ?? "gpt-4o-mini";

    try {
      const response = await this.llm.complete({
        provider,
        model,
        prompt,
        temperature: quickConfig?.temperature ?? 0.1,
        maxTokens: quickConfig?.maxTokens ?? 1000,
      });

      const extraction = this.parseExtractionResult(response.text);
      const validated = await this.validateAndEnrich(extraction, tracker);
      this.contextManager.updateTracker(tracker, validated, options?.userName);

      return validated;
    } catch (err) {
      console.error("memory-neo4j: quick extraction failed", err);
      return { entities: [], relations: [] };
    }
  }

  private async deepExtract(
    message: string,
    sessionId: string,
    options?: { userName?: string; skipContext?: boolean }
  ): Promise<ExtractionResult> {
    const tracker = this.contextManager.getOrCreate(sessionId, options?.userName);
    const graphContext = await this.getRelevantGraphContext(message, tracker);

    const deepConfig = this.config.models?.extraction?.deep;
    let modelConfig: { provider: string; model: string };

    if (deepConfig?.useMainModel && this.llm.getMainModel) {
      const mainModel = this.llm.getMainModel();
      if (mainModel) {
        modelConfig = mainModel;
      } else {
        modelConfig = { provider: "openai", model: "gpt-4o" };
      }
    } else if (deepConfig?.provider && deepConfig?.model) {
      modelConfig = { provider: deepConfig.provider, model: deepConfig.model };
    } else {
      modelConfig = { provider: "openai", model: "gpt-4o" };
    }

    const fullContext = this.buildFullContext(tracker, graphContext);
    const prompt = DEEP_EXTRACTION_PROMPT
      .replace("{fullContext}", fullContext)
      .replace("{message}", message);

    try {
      const response = await this.llm.complete({
        provider: modelConfig.provider,
        model: modelConfig.model,
        prompt,
        temperature: deepConfig?.temperature ?? 0.1,
        maxTokens: deepConfig?.maxTokens ?? 2000,
      });

      const extraction = this.parseExtractionResult(response.text);
      const validated = await this.validateAndEnrich(extraction, tracker);
      this.contextManager.updateTracker(tracker, validated, options?.userName);

      return validated;
    } catch (err) {
      console.error("memory-neo4j: deep extraction failed", err);
      return { entities: [], relations: [] };
    }
  }

  private async independentExtract(
    message: string,
    sessionId: string,
    options?: { userName?: string }
  ): Promise<ExtractionResult> {
    const tracker = this.contextManager.getOrCreate(sessionId, options?.userName);
    const graphContext = await this.getRelevantGraphContext(message, tracker);

    const prompt = EXTRACTION_PROMPT.replace(
      "{sessionContext}",
      this.contextManager.buildExtractionContext(tracker)
    )
      .replace("{existingGraph}", graphContext)
      .replace("{newMessage}", message);

    const quickConfig = this.config.models?.extraction?.quick;

    let provider = quickConfig?.provider;
    let model = quickConfig?.model;

    if (!provider || !model) {
      if (this.llm.getMainModel) {
        const mainModel = this.llm.getMainModel();
        if (mainModel) {
          provider = provider ?? mainModel.provider;
          model = model ?? mainModel.model;
        }
      }
    }

    provider = provider ?? "openai";
    model = model ?? "gpt-4o-mini";

    try {
      const response = await this.llm.complete({
        provider,
        model,
        prompt,
        temperature: quickConfig?.temperature ?? 0.1,
        maxTokens: quickConfig?.maxTokens ?? 2000,
      });

      const extraction = this.parseExtractionResult(response.text);
      const validated = await this.validateAndEnrich(extraction, tracker);
      this.contextManager.updateTracker(tracker, validated, options?.userName);

      return validated;
    } catch (err) {
      console.error("memory-neo4j: independent extraction failed", err);
      return { entities: [], relations: [] };
    }
  }

  private shouldTriggerDeepExtraction(
    message: string,
    quickResult: ExtractionResult
  ): boolean {
    const deepConfig = this.config.models?.extraction?.deep;
    if (!deepConfig?.enabled) return false;

    const triggers = deepConfig.triggerOn;
    if (!triggers) return false;

    if (quickResult.entities.length >= (triggers.entityCount ?? 3)) {
      return true;
    }

    if (quickResult.relations.length >= (triggers.relationCount ?? 2)) {
      return true;
    }

    if (triggers.userKeywords && triggers.userKeywords.length > 0) {
      const lowerMessage = message.toLowerCase();
      if (triggers.userKeywords.some((k: string) => lowerMessage.includes(k.toLowerCase()))) {
        return true;
      }
    }

    return false;
  }

  private scheduleDeepExtraction(
    message: string,
    sessionId: string,
    quickResult: ExtractionResult
  ): void {
    this.deepExtractionQueue.push({
      message,
      sessionId,
      quickResult,
      timestamp: Date.now(),
    });

    if (!this.processingDeepQueue) {
      this.processDeepQueue();
    }
  }

  private async processDeepQueue(): Promise<void> {
    if (this.processingDeepQueue || this.deepExtractionQueue.length === 0) {
      return;
    }

    this.processingDeepQueue = true;

    while (this.deepExtractionQueue.length > 0) {
      const item = this.deepExtractionQueue.shift();
      if (!item) break;

      try {
        const deepResult = await this.deepExtract(item.message, item.sessionId);

        const mergedResult = this.mergeResults(item.quickResult, deepResult);

        for (const callback of this.callbacks) {
          try {
            await callback(item.sessionId, mergedResult);
          } catch (err) {
            console.error("memory-neo4j: deep extraction callback failed", err);
          }
        }
      } catch (err) {
        console.error("memory-neo4j: queued deep extraction failed", err);
      }
    }

    this.processingDeepQueue = false;
  }

  private mergeResults(
    quick: ExtractionResult,
    deep: ExtractionResult
  ): ExtractionResult {
    const entityMap = new Map<string, ExtractionEntity>();

    for (const e of quick.entities) {
      entityMap.set(e.name, e);
    }

    for (const e of deep.entities) {
      const existing = entityMap.get(e.name);
      if (existing) {
        entityMap.set(e.name, {
          ...existing,
          ...e,
          attributes: { ...existing.attributes, ...e.attributes },
          confidence: Math.max(existing.confidence, e.confidence),
        });
      } else {
        entityMap.set(e.name, e);
      }
    }

    const relationSet = new Set<string>();
    const relations: ExtractionRelation[] = [];

    const relationKey = (r: ExtractionRelation) =>
      `${r.from}|${r.to}|${r.type}`;

    for (const r of [...quick.relations, ...deep.relations]) {
      const key = relationKey(r);
      if (!relationSet.has(key)) {
        relationSet.add(key);
        relations.push(r);
      }
    }

    return {
      entities: Array.from(entityMap.values()),
      relations,
      pronounUpdates: { ...quick.pronounUpdates, ...deep.pronounUpdates },
      contextUpdate: deep.contextUpdate ?? quick.contextUpdate,
    };
  }

  private buildFullContext(
    tracker: SessionEntityTracker,
    graphContext: string
  ): string {
    const parts: string[] = [];

    parts.push("## 会话上下文");
    parts.push(this.contextManager.buildExtractionContext(tracker));

    parts.push("\n## 已有知识图谱");
    parts.push(graphContext);

    const recentEntities = this.contextManager.getRecentEntities(tracker, 10);
    if (recentEntities.length > 0) {
      parts.push("\n## 最近提及的实体");
      parts.push(recentEntities.map((e) => `- ${e.name} (${e.type})`).join("\n"));
    }

    return parts.join("\n");
  }

  private parseExtractionResult(text: string): ExtractionResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { entities: [], relations: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        entities: (parsed.entities || []).filter(
          (e: ExtractionEntity) => e.name && e.type && e.confidence >= (this.config.extraction?.minConfidence ?? 0.6)
        ),
        relations: (parsed.relations || []).filter(
          (r: ExtractionRelation) => r.from && r.to && r.type && r.confidence >= (this.config.extraction?.minConfidence ?? 0.6)
        ),
        pronounUpdates: parsed.pronounUpdates || {},
        contextUpdate: parsed.contextUpdate,
      };
    } catch {
      return { entities: [], relations: [] };
    }
  }

  private async validateAndEnrich(
    extraction: ExtractionResult,
    tracker: SessionEntityTracker
  ): Promise<ExtractionResult> {
    const validatedEntities: ExtractionEntity[] = [];
    const validatedRelations: ExtractionRelation[] = [];

    for (const entity of extraction.entities) {
      if (entity.action === "create") {
        const existing = await this.graphStore.findSimilarEntity(
          entity.name,
          entity.type as MemoryNodeType,
          entity.aliases
        );

        if (existing && existing.confidence >= 0.8) {
          entity.action = "update";
          entity.id = existing.id;
        }
      }

      if (entity.action === "reference" && !entity.id) {
        const tracked = this.contextManager.findEntityByAlias(tracker, entity.name);
        if (tracked) {
          entity.id = tracked.id;
        }
      }

      const activeProject = this.contextManager.getActiveProject(tracker);
      if (activeProject && entity.type !== "Project") {
        entity.attributes = entity.attributes || {};
        if (!entity.attributes.project) {
          entity.attributes.project = activeProject;
        }
      }

      validatedEntities.push(entity);
    }

    for (const relation of extraction.relations) {
      const fromExists =
        this.entityExistsInExtraction(relation.from, validatedEntities) ||
        this.contextManager.findEntityByAlias(tracker, relation.from) ||
        (await this.graphStore.getEntityByName(relation.from));

      const toExists =
        this.entityExistsInExtraction(relation.to, validatedEntities) ||
        this.contextManager.findEntityByAlias(tracker, relation.to) ||
        (await this.graphStore.getEntityByName(relation.to));

      if (fromExists && toExists) {
        validatedRelations.push(relation);
      }
    }

    return {
      entities: validatedEntities,
      relations: validatedRelations,
      pronounUpdates: extraction.pronounUpdates,
      contextUpdate: extraction.contextUpdate,
    };
  }

  private entityExistsInExtraction(
    name: string,
    entities: ExtractionEntity[]
  ): boolean {
    return entities.some(
      (e) =>
        e.name === name ||
        e.aliases?.includes(name) ||
        e.id === name
    );
  }

  private async getRelevantGraphContext(
    message: string,
    tracker: SessionEntityTracker
  ): Promise<string> {
    const contextParts: string[] = [];

    const activeProject = this.contextManager.getActiveProject(tracker);
    if (activeProject) {
      try {
        const projectContext = await this.graphStore.getProjectContext(activeProject);
        if (projectContext.project) {
          contextParts.push(`项目: ${projectContext.project.name}`);
          if (projectContext.entities.length > 0) {
            contextParts.push(
              "项目相关实体:\n" +
                projectContext.entities
                  .map((e) => `- ${e.name} (${e.type})`)
                  .join("\n")
            );
          }
        }
      } catch {
        // ignore
      }
    }

    const recentEntities = this.contextManager.getRecentEntities(tracker, 5);
    if (recentEntities.length > 0) {
      contextParts.push(
        "最近提及的实体:\n" +
          recentEntities.map((e) => `- ${e.name} (${e.type})`).join("\n")
      );
    }

    return contextParts.join("\n\n") || "无相关图数据";
  }

  shouldUseDeepExtract(message: string, quickResult: ExtractionResult): boolean {
    return this.shouldTriggerDeepExtraction(message, quickResult);
  }
}

export function detectExtractionTriggers(text: string): boolean {
  const triggers = [
    /记住|记下|记得|remember/i,
    /重要|关键|critical|important/i,
    /我的\w+(是|叫)|my \w+ is/i,
    /偏好|喜欢|讨厌|prefer|like|hate/i,
    /决定|选择|decided|chose/i,
    /正在(写|做|开发)|working on|writing/i,
    /主角|角色|character|protagonist/i,
    /项目|作品|project/i,
  ];

  return triggers.some((r) => r.test(text));
}
