import { Type, type Static } from "@sinclair/typebox";

export const neo4jMemoryConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),

  connection: Type.Object({
    uri: Type.String({ default: "bolt://localhost:7687" }),
    username: Type.String({ default: "neo4j" }),
    password: Type.String(),
    database: Type.Optional(Type.String({ default: "neo4j" })),
    maxConnectionPoolSize: Type.Optional(Type.Number({ default: 50 })),
    connectionTimeout: Type.Optional(Type.Number({ default: 30000 })),
  }),

  models: Type.Object({
    strategy: Type.Optional(
      Type.Union(
        [
          Type.Literal("same-as-main"),
          Type.Literal("independent"),
          Type.Literal("hybrid"),
        ],
        { default: "hybrid" }
      )
    ),

    extraction: Type.Object({
      quick: Type.Optional(
        Type.Object({
          enabled: Type.Boolean({ default: true }),
          provider: Type.String({ default: "openai" }),
          model: Type.String({ default: "gpt-4o-mini" }),
          useMainModel: Type.Optional(Type.Boolean({ default: false })),
          temperature: Type.Optional(Type.Number({ default: 0.1 })),
          maxTokens: Type.Optional(Type.Number({ default: 1000 })),
          maxRequestsPerHour: Type.Optional(Type.Number({ default: 100 })),
          maxTokensPerDay: Type.Optional(Type.Number({ default: 100000 })),
        })
      ),

      deep: Type.Optional(
        Type.Object({
          enabled: Type.Boolean({ default: true }),
          useMainModel: Type.Optional(Type.Boolean({ default: true })),
          provider: Type.Optional(Type.String()),
          model: Type.Optional(Type.String()),
          temperature: Type.Optional(Type.Number({ default: 0.1 })),
          maxTokens: Type.Optional(Type.Number({ default: 2000 })),
          triggerOn: Type.Optional(
            Type.Object({
              entityCount: Type.Number({ default: 3 }),
              relationCount: Type.Number({ default: 2 }),
              hasAmbiguity: Type.Boolean({ default: true }),
              userKeywords: Type.Array(Type.String(), {
                default: ["记住", "remember", "重要", "important", "保存", "save"],
              }),
            })
          ),
        })
      ),
    }),

    embedding: Type.Object({
      enabled: Type.Boolean({ default: true }),
      provider: Type.String({ default: "openai" }),
      model: Type.String({ default: "text-embedding-3-small" }),
      fallback: Type.Optional(
        Type.Object({
          provider: Type.String(),
          model: Type.String(),
        })
      ),
    }),

    reasoning: Type.Object({
      useMainModel: Type.Boolean({ default: true }),
      provider: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
    }),
  }),

  extraction: Type.Object({
    enabled: Type.Optional(Type.Boolean({ default: true })),
    mode: Type.Optional(
      Type.Union(
        [Type.Literal("auto"), Type.Literal("manual"), Type.Literal("hybrid")],
        { default: "hybrid" }
      )
    ),

    entityTypes: Type.Optional(
      Type.Array(Type.String(), {
        default: [
          "Person",
          "Place",
          "Organization",
          "Project",
          "Character",
          "Event",
          "Concept",
          "Preference",
          "Fact",
          "Decision",
        ],
      })
    ),

    minConfidence: Type.Optional(Type.Number({ default: 0.6 })),
    maxEntitiesPerMessage: Type.Optional(Type.Number({ default: 10 })),
    maxChars: Type.Optional(Type.Number({ default: 2000 })),
  }),

  retrieval: Type.Object({
    maxHops: Type.Optional(Type.Number({ default: 3 })),
    maxResults: Type.Optional(Type.Number({ default: 20 })),
    minConfidence: Type.Optional(Type.Number({ default: 0.5 })),
    includeContext: Type.Optional(Type.Boolean({ default: true })),

    hybridSearch: Type.Optional(
      Type.Object({
        enabled: Type.Boolean({ default: true }),
        vectorWeight: Type.Number({ default: 0.4 }),
        graphWeight: Type.Number({ default: 0.6 }),
      })
    ),
  }),

  lifecycle: Type.Object({
    autoRecall: Type.Optional(Type.Boolean({ default: true })),
    autoCapture: Type.Optional(Type.Boolean({ default: true })),
    recallLimit: Type.Optional(Type.Number({ default: 5 })),

    memoryFlush: Type.Optional(
      Type.Object({
        enabled: Type.Boolean({ default: true }),
        onCompaction: Type.Boolean({ default: true }),
      })
    ),
  }),

  priority: Type.Object({
    enabled: Type.Optional(Type.Boolean({ default: true })),
    autoDetect: Type.Optional(Type.Boolean({ default: true })),

    criticalKeywords: Type.Optional(
      Type.Array(Type.String(), {
        default: ["必须", "重要", "关键", "critical", "important", "must"],
      })
    ),
  }),

  conflict: Type.Object({
    strategy: Type.Optional(
      Type.Union(
        [Type.Literal("ask-user"), Type.Literal("confidence-based"), Type.Literal("newest-wins")],
        { default: "confidence-based" }
      )
    ),
    preserveHistory: Type.Optional(Type.Boolean({ default: true })),
    maxHistoryLength: Type.Optional(Type.Number({ default: 10 })),
  }),

  forgetting: Type.Object({
    decay: Type.Optional(
      Type.Object({
        enabled: Type.Boolean({ default: true }),
        halfLife: Type.Number({ default: 2592000000 }),
        minConfidence: Type.Number({ default: 0.3 }),
        accessBoost: Type.Number({ default: 0.1 }),
      })
    ),

    cleanup: Type.Optional(
      Type.Object({
        enabled: Type.Boolean({ default: true }),
        interval: Type.Number({ default: 86400000 }),
        maxAge: Type.Number({ default: 31536000000 }),
        minAccessCount: Type.Number({ default: 1 }),
      })
    ),

    archive: Type.Optional(
      Type.Object({
        enabled: Type.Boolean({ default: false }),
        archiveAfter: Type.Number({ default: 15552000000 }),
        archiveLocation: Type.String({ default: "" }),
      })
    ),
  }),

  provenance: Type.Object({
    enabled: Type.Optional(Type.Boolean({ default: true })),
    trackHistory: Type.Optional(Type.Boolean({ default: true })),
    maxHistoryLength: Type.Optional(Type.Number({ default: 10 })),
  }),

  performance: Type.Object({
    asyncProcessing: Type.Optional(Type.Boolean({ default: true })),
    cacheEnabled: Type.Optional(Type.Boolean({ default: true })),
    cacheTTL: Type.Optional(Type.Number({ default: 3600000 })),
    cacheMaxSize: Type.Optional(Type.Number({ default: 1000 })),
  }),
});

export type Neo4jMemoryConfig = Static<typeof neo4jMemoryConfigSchema>;

export const DEFAULT_CONFIG: Partial<Neo4jMemoryConfig> = {
  enabled: true,
  connection: {
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "",
    database: "neo4j",
    maxConnectionPoolSize: 50,
    connectionTimeout: 30000,
  },
  models: {
    strategy: "hybrid",
    extraction: {
      quick: {
        enabled: true,
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.1,
        maxTokens: 1000,
      },
      deep: {
        enabled: true,
        useMainModel: true,
        temperature: 0.1,
        maxTokens: 2000,
      },
    },
    embedding: {
      enabled: true,
      provider: "openai",
      model: "text-embedding-3-small",
    },
    reasoning: {
      useMainModel: true,
    },
  },
  extraction: {
    enabled: true,
    mode: "hybrid",
    minConfidence: 0.6,
    maxEntitiesPerMessage: 10,
    maxChars: 2000,
  },
  retrieval: {
    maxHops: 3,
    maxResults: 20,
    minConfidence: 0.5,
    includeContext: true,
    hybridSearch: {
      enabled: true,
      vectorWeight: 0.4,
      graphWeight: 0.6,
    },
  },
  lifecycle: {
    autoRecall: true,
    autoCapture: true,
    recallLimit: 5,
  },
  priority: {
    enabled: true,
    autoDetect: true,
  },
  conflict: {
    strategy: "confidence-based",
    preserveHistory: true,
    maxHistoryLength: 10,
  },
  forgetting: {
    decay: {
      enabled: true,
      halfLife: 2592000000,
      minConfidence: 0.3,
      accessBoost: 0.1,
    },
    cleanup: {
      enabled: true,
      interval: 86400000,
      maxAge: 31536000000,
      minAccessCount: 1,
    },
  },
  provenance: {
    enabled: true,
    trackHistory: true,
    maxHistoryLength: 10,
  },
  performance: {
    asyncProcessing: true,
    cacheEnabled: true,
    cacheTTL: 3600000,
    cacheMaxSize: 1000,
  },
};
