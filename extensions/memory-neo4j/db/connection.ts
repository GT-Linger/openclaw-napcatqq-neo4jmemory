import type { Driver, Session, ManagedTransaction } from "neo4j-driver";

export interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
}

export class Neo4jConnection {
  private driver: Driver | null = null;
  private initPromise: Promise<void> | null = null;
  private isConnected = false;

  constructor(private config: Neo4jConnectionConfig) {}

  async initialize(): Promise<void> {
    if (this.driver && this.isConnected) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const neo4j = await import("neo4j-driver");

    this.driver = neo4j.default.driver(
      this.config.uri,
      neo4j.default.auth.basic(this.config.username, this.config.password),
      {
        maxConnectionPoolSize: this.config.maxConnectionPoolSize ?? 50,
        connectionTimeout: this.config.connectionTimeout ?? 30000,
      }
    );

    await this.driver.verifyConnectivity();
    this.isConnected = true;
    await this.runMigrations();
  }

  private async runMigrations(): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:MemoryNode) REQUIRE n.id IS UNIQUE
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MemoryNode) ON (n.type)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MemoryNode) ON (n.name)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MemoryNode) ON (n.createdAt)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MemoryNode) ON (n.lastAccessedAt)
      `);
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:MemoryNode) ON (n.confidence)
      `);
      await session.run(`
        CREATE FULLTEXT INDEX memoryIndex IF NOT EXISTS 
        FOR (n:MemoryNode) ON EACH [n.name, n.content]
      `);
    } finally {
      await session.close();
    }
  }

  getSession(): Session {
    if (!this.driver) throw new Error("Neo4j not initialized");
    return this.driver.session({ database: this.config.database ?? "neo4j" });
  }

  async withSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
    const session = this.getSession();
    try {
      return await fn(session);
    } finally {
      await session.close();
    }
  }

  async withTransaction<T>(fn: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    return this.withSession(async (session) => {
      return session.executeWrite(fn);
    });
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.isConnected = false;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.driver) {
        return { healthy: false, message: "Driver not initialized" };
      }
      await this.driver.verifyConnectivity();
      return { healthy: true };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getStats(): Promise<{
    nodeCount: number;
    relationCount: number;
    typeCounts: Record<string, number>;
  }> {
    return this.withSession(async (session) => {
      const nodeResult = await session.run(`
        MATCH (n:MemoryNode) RETURN count(n) as count
      `);
      const relationResult = await session.run(`
        MATCH ()-[r:RELATES_TO]->() RETURN count(r) as count
      `);
      const typeResult = await session.run(`
        MATCH (n:MemoryNode) 
        RETURN n.type as type, count(n) as count
        ORDER BY count DESC
      `);

      const typeCounts: Record<string, number> = {};
      for (const record of typeResult.records) {
        typeCounts[record.get("type")] = record.get("count").toNumber();
      }

      return {
        nodeCount: nodeResult.records[0]?.get("count")?.toNumber() ?? 0,
        relationCount: relationResult.records[0]?.get("count")?.toNumber() ?? 0,
        typeCounts,
      };
    });
  }
}
