import type { BaseProbeResult } from "openclaw/plugin-sdk";
import type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
  MarkdownConfig,
  OpenClawConfig,
} from "openclaw/plugin-sdk";

export type NapCatQQGroupConfig = {
  requireMention?: boolean;
  tools?: GroupToolPolicyConfig;
  toolsBySender?: GroupToolPolicyBySenderConfig;
  skills?: string[];
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  systemPrompt?: string;
};

export type NapCatQQAccountConfig = {
  name?: string;
  enabled?: boolean;
  wsPort?: number;
  wsHost?: string;
  wsPath?: string;
  accessToken?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
  groupPolicy?: GroupPolicy;
  groupAllowFrom?: Array<string | number>;
  groups?: Record<string, NapCatQQGroupConfig>;
  mentionPatterns?: string[];
  markdown?: MarkdownConfig;
  historyLimit?: number;
  dmHistoryLimit?: number;
  dms?: Record<string, DmConfig>;
  textChunkLimit?: number;
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  mediaMaxMb?: number;
};

export type NapCatQQConfig = NapCatQQAccountConfig & {
  accounts?: Record<string, NapCatQQAccountConfig>;
};

export type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & {
    napcatqq?: NapCatQQConfig;
  };
};

export type NapCatQQInboundMessage = {
  messageId: string | number;
  target: string;
  senderId: number;
  senderNick: string;
  senderCard?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: number;
  rawMessage: OneBotMessage;
  replyToId?: string | number;
};

export type NapCatQQProbe = BaseProbeResult<string> & {
  selfId?: number;
  nickname?: string;
  online?: boolean;
  latencyMs?: number;
};

export type NapCatQQConnectionState = {
  connected: boolean;
  selfId?: number;
  nickname?: string;
  connectedAt?: number;
  lastHeartbeat?: number;
};

export type NapCatQQRuntimeState = NapCatQQConnectionState & {
  accountId: string;
  running: boolean;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
};

export type ResolvedNapCatQQAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  config: {
    dmPolicy: "open" | "pairing" | "closed";
    allowFrom: Array<string | number>;
    defaultTo?: string;
    groupPolicy: "open" | "allowlist" | "disabled";
    groupAllowFrom: Array<string | number>;
    groups: Record<string, NapCatQQGroupConfig>;
    mentionPatterns?: string[];
    markdown?: MarkdownConfig;
    historyLimit?: number;
    dmHistoryLimit?: number;
    dms?: Record<string, DmConfig>;
    textChunkLimit: number;
    blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
    mediaMaxMb: number;
  };
  wsPort: number;
  wsHost: string;
  wsPath: string;
  accessToken?: string;
};

import type {
  OneBotMessage,
} from "./onebot-types.js";

export type { OneBotMessage };
