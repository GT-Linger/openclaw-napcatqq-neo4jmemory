import type { GatewayClientHelloOk } from "@openclaw/dashboard-gateway-client";

export type OverviewSnapshot = {
  uptimeMs: number | null;
  tickIntervalMs: number | null;
  authMode: string | null;
  protocolVersion: number | null;
  gatewayVersion: string | null;
};

type SnapshotPayload = {
  uptimeMs?: number;
  authMode?: string;
};

/** Top-level hello-ok fields that live outside `snapshot`. */
type HelloExtras = {
  policy?: { tickIntervalMs?: number };
  server?: { version?: string };
};

export function parseOverviewSnapshot(hello: GatewayClientHelloOk | null): OverviewSnapshot {
  if (!hello) {
    return {
      uptimeMs: null,
      tickIntervalMs: null,
      authMode: null,
      protocolVersion: null,
      gatewayVersion: null,
    };
  }

  const snapshot = hello.snapshot as SnapshotPayload | undefined;
  // `policy` and `server` are top-level hello-ok siblings, not nested in `snapshot`.
  const extras = hello as unknown as HelloExtras;

  return {
    uptimeMs: snapshot?.uptimeMs ?? null,
    tickIntervalMs: extras.policy?.tickIntervalMs ?? null,
    authMode: snapshot?.authMode ?? null,
    protocolVersion: hello.protocol ?? null,
    gatewayVersion: extras.server?.version ?? null,
  };
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) {
    return "just now";
  }
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s ago`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
