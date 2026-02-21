type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export type AgentInfo = {
  id: string;
  name?: string;
  identity?: { name?: string; emoji?: string };
};

export type AgentsListResult = {
  defaultId: string;
  agents: AgentInfo[];
};

export async function loadAgents(request: GatewayRequest): Promise<AgentsListResult> {
  const result = await request<AgentsListResult>("agents.list", {});
  return result ?? { defaultId: "main", agents: [] };
}
