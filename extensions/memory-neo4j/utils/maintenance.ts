import type { GraphStore } from "../db/store.js";
import type { Neo4jMemoryConfig } from "../config.js";

export interface MaintenanceOptions {
  graphStore: GraphStore;
  config: Neo4jMemoryConfig;
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export class MemoryMaintenance {
  private graphStore: GraphStore;
  private config: Neo4jMemoryConfig;
  private logger: MaintenanceOptions["logger"];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MaintenanceOptions) {
    this.graphStore = options.graphStore;
    this.config = options.config;
    this.logger = options.logger;
  }

  start(): void {
    const decayConfig = this.config.forgetting?.decay;
    const cleanupConfig = this.config.forgetting?.cleanup;

    if (decayConfig?.enabled) {
      const interval = decayConfig.halfLife / 10; // Run decay 10 times per half-life
      this.decayTimer = setInterval(() => {
        this.runDecay().catch((err) => {
          this.logger?.warn("memory-neo4j: decay failed", { error: String(err) });
        });
      }, Math.min(interval, 24 * 60 * 60 * 1000)); // At most once per day
    }

    if (cleanupConfig?.enabled) {
      this.cleanupTimer = setInterval(() => {
        this.runCleanup().catch((err) => {
          this.logger?.warn("memory-neo4j: cleanup failed", { error: String(err) });
        });
      }, cleanupConfig.interval || 24 * 60 * 60 * 1000);
    }

    this.logger?.info("memory-neo4j: maintenance started");
  }

  stop(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.logger?.info("memory-neo4j: maintenance stopped");
  }

  async runDecay(): Promise<number> {
    const decayConfig = this.config.forgetting?.decay;
    if (!decayConfig?.enabled) {
      return 0;
    }

    const threshold = Date.now() - decayConfig.halfLife;
    const updated = await this.graphStore.decayConfidence({
      threshold,
      halfLife: decayConfig.halfLife,
      minConfidence: decayConfig.minConfidence,
    });

    this.logger?.info("memory-neo4j: decay completed", { updated });
    return updated;
  }

  async runCleanup(): Promise<{ lowConfidence: number; oldNodes: number }> {
    const cleanupConfig = this.config.forgetting?.cleanup;
    const decayConfig = this.config.forgetting?.decay;

    let lowConfidence = 0;
    let oldNodes = 0;

    if (cleanupConfig?.enabled) {
      lowConfidence = await this.graphStore.cleanupLowConfidence({
        minConfidence: decayConfig?.minConfidence ?? 0.3,
        maxAge: Date.now() - cleanupConfig.maxAge,
      });

      oldNodes = await this.graphStore.cleanupOldNodes({
        maxAge: Date.now() - cleanupConfig.maxAge,
        minAccessCount: cleanupConfig.minAccessCount,
      });

      this.logger?.info("memory-neo4j: cleanup completed", {
        lowConfidence,
        oldNodes,
      });
    }

    return { lowConfidence, oldNodes };
  }

  async runFullMaintenance(): Promise<{
    decay: number;
    cleanup: { lowConfidence: number; oldNodes: number };
  }> {
    const decay = await this.runDecay();
    const cleanup = await this.runCleanup();

    return { decay, cleanup };
  }

  async getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    avgConfidence: number;
    oldestEntity: number;
    newestEntity: number;
  }> {
    const entityCount = await this.graphStore.countEntities();
    const relationCount = await this.graphStore.countRelations();

    return {
      entityCount,
      relationCount,
      avgConfidence: 0,
      oldestEntity: 0,
      newestEntity: 0,
    };
  }
}

export function createMaintenanceScheduler(options: MaintenanceOptions): MemoryMaintenance {
  const maintenance = new MemoryMaintenance(options);
  maintenance.start();
  return maintenance;
}
