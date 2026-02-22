import type { IconName } from "../components/icons.js";

export const TAB_GROUPS = [
  { label: "chat", tabs: ["chat"] },
  {
    label: "control",
    tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"],
  },
  { label: "agent", tabs: ["agents", "skills", "nodes"] },
  { label: "settings", tabs: ["config", "debug", "logs"] },
] as const;

export type TabGroup = (typeof TAB_GROUPS)[number]["label"];

export type Tab =
  | "agents"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "debug"
  | "logs";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  debug: "/debug",
  logs: "/logs",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

const TAB_TITLES: Record<Tab, string> = {
  chat: "Chat",
  overview: "Overview",
  channels: "Channels",
  instances: "Instances",
  sessions: "Sessions",
  usage: "Usage",
  cron: "Cron",
  agents: "Agents",
  skills: "Skills",
  nodes: "Nodes",
  config: "Config",
  debug: "Debug",
  logs: "Logs",
};

const TAB_SUBTITLES: Record<Tab, string> = {
  chat: "Send messages to agents",
  overview: "Gateway status and health",
  channels: "Messaging channel connections",
  instances: "Connected gateway instances",
  sessions: "Active chat sessions",
  usage: "Token and cost tracking",
  cron: "Scheduled jobs",
  agents: "Agent configurations",
  skills: "Installed skills",
  nodes: "Connected compute nodes",
  config: "Gateway configuration",
  debug: "Debug tools",
  logs: "Gateway event logs",
};

const GROUP_TITLES: Record<TabGroup, string> = {
  chat: "Chat",
  control: "Control",
  agent: "Agent",
  settings: "Settings",
};

const TAB_ICONS: Record<Tab, IconName> = {
  chat: "messageSquare",
  overview: "barChart",
  channels: "link",
  instances: "radio",
  sessions: "fileText",
  usage: "barChart",
  cron: "loader",
  agents: "folder",
  skills: "zap",
  nodes: "monitor",
  config: "settings",
  debug: "bug",
  logs: "scrollText",
};

/** Tabs that have real implementations (not placeholders) */
export const IMPLEMENTED_TABS: Set<Tab> = new Set(["overview", "chat", "skills"]);

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  const normalized = normalizePath(path).toLowerCase();
  if (normalized === "/") {
    return "overview";
  }
  return (PATH_TO_TAB.get(normalized) as Tab) ?? null;
}

export function titleForTab(tab: Tab): string {
  return TAB_TITLES[tab];
}

export function subtitleForTab(tab: Tab): string {
  return TAB_SUBTITLES[tab];
}

export function iconForTab(tab: Tab): IconName {
  return TAB_ICONS[tab];
}

export function titleForGroup(group: TabGroup): string {
  return GROUP_TITLES[group];
}
