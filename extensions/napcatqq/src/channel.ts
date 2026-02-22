import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  getChatChannelMeta,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import {
  listNapCatQQAccountIds,
  resolveDefaultNapCatQQAccountId,
  resolveNapCatQQAccount,
  type ResolvedNapCatQQAccount,
} from "./accounts.js";
import { NapCatQQConfigSchema } from "./config-schema.js";
import { monitorNapCatQQProvider } from "./monitor.js";
import { napcatqqOnboardingAdapter } from "./onboarding.js";
import { probeNapCatQQ } from "./probe.js";
import { getNapCatQQRuntime, getNapCatQQAccountState } from "./runtime.js";
import { sendPrivateMessage, sendGroupMessage, isNapCatQQConnected } from "./websocket.js";
import type { CoreConfig, NapCatQQProbe } from "./types.js";

const meta = getChatChannelMeta("napcatqq");

function normalizeNapCatQQAllowEntry(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry.toLowerCase();
  }
  if (typeof entry === "number") {
    return String(entry);
  }
  if (entry && typeof entry === "object" && "id" in entry) {
    return String((entry as { id: unknown }).id).toLowerCase();
  }
  return null;
}

function normalizePairingTarget(raw: string): string {
  const normalized = normalizeNapCatQQAllowEntry(raw);
  return normalized ?? "";
}

export const napcatqqPlugin: ChannelPlugin<ResolvedNapCatQQAccount, NapCatQQProbe> = {
  id: "napcatqq",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  onboarding: napcatqqOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.napcatqq"] },
  configSchema: buildChannelConfigSchema(NapCatQQConfigSchema),
  config: {
    listAccountIds: (cfg) => listNapCatQQAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultNapCatQQAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "napcatqq",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "napcatqq",
        accountId,
        clearBaseFields: [
          "name",
          "wsPort",
          "wsHost",
          "wsPath",
          "accessToken",
        ],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      wsPort: account.wsPort,
      wsHost: account.wsHost,
      wsPath: account.wsPath,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => normalizeNapCatQQAllowEntry(String(entry))).filter(Boolean) as string[],
    resolveDefaultTo: ({ cfg, accountId }) =>
      resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo?.trim() ||
      undefined,
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.napcatqq?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.napcatqq.accounts.${resolvedAccountId}.`
        : "channels.napcatqq.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: `${basePath}allowFrom`,
        approveHint: formatPairingApproveHint("napcatqq"),
        normalizeEntry: (raw) => normalizeNapCatQQAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const warnings: string[] = [];
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy === "open") {
        warnings.push(
          '- QQ groups: groupPolicy="open" allows all groups and senders. Prefer channels.napcatqq.groupPolicy="allowlist" with channels.napcatqq.groups.',
        );
      }
      if (!account.accessToken) {
        warnings.push(
          "- No accessToken configured; WebSocket connections will not be authenticated.",
        );
      }
      return warnings;
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId });
      if (!groupId) {
        return false;
      }
      const groupConfig = account.config.groups?.[groupId];
      return groupConfig?.requireMention ?? false;
    },
    resolveToolPolicy: ({ cfg, accountId, groupId }) => {
      const account = resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId });
      if (!groupId) {
        return undefined;
      }
      const groupConfig = account.config.groups?.[groupId];
      return groupConfig?.tools;
    },
  },
  messaging: {
    normalizeTarget: (input: string) => {
      const trimmed = input.trim();
      if (trimmed.startsWith("group:")) {
        return trimmed;
      }
      if (trimmed.startsWith("user:")) {
        return trimmed;
      }
      const numId = parseInt(trimmed, 10);
      if (!isNaN(numId)) {
        return `user:${numId}`;
      }
      return null;
    },
    targetResolver: {
      looksLikeId: (input: string) => {
        const trimmed = input.trim();
        if (trimmed.startsWith("group:") || trimmed.startsWith("user:")) {
          return true;
        }
        return !isNaN(parseInt(trimmed, 10));
      },
      hint: "<userId|group:groupId>",
    },
  },
  resolver: {
    resolveTargets: async ({ inputs, kind }) => {
      return inputs.map((input) => {
        const trimmed = input.trim();
        if (trimmed.startsWith("group:")) {
          const groupId = trimmed.replace("group:", "");
          if (kind === "group") {
            return { input, resolved: true, id: groupId, name: `Group ${groupId}` };
          }
          return { input, resolved: false, note: "expected user target" };
        }
        if (trimmed.startsWith("user:")) {
          const userId = trimmed.replace("user:", "");
          if (kind === "direct" || !kind) {
            return { input, resolved: true, id: userId, name: `User ${userId}` };
          }
          return { input, resolved: false, note: "expected group target" };
        }
        const numId = parseInt(trimmed, 10);
        if (!isNaN(numId)) {
          if (kind === "group") {
            return { input, resolved: true, id: String(numId), name: `Group ${numId}` };
          }
          return { input, resolved: true, id: String(numId), name: `User ${numId}` };
        }
        return { input, resolved: false, note: "invalid QQ target" };
      });
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId });
      const q = query?.trim().toLowerCase() ?? "";
      const ids = new Set<string>();

      for (const entry of account.config.allowFrom ?? []) {
        const normalized = normalizeNapCatQQAllowEntry(entry);
        if (normalized && normalized !== "*") {
          ids.add(normalized);
        }
      }
      for (const entry of account.config.groupAllowFrom ?? []) {
        const normalized = normalizeNapCatQQAllowEntry(entry);
        if (normalized && normalized !== "*") {
          ids.add(normalized);
        }
      }
      for (const group of Object.values(account.config.groups ?? {})) {
        for (const entry of group.allowFrom ?? []) {
          const normalized = normalizeNapCatQQAllowEntry(entry);
          if (normalized && normalized !== "*") {
            ids.add(normalized);
          }
        }
      }

      return Array.from(ids)
        .filter((id) => (q ? id.includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }));
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveNapCatQQAccount({ cfg: cfg as CoreConfig, accountId });
      const q = query?.trim().toLowerCase() ?? "";
      const groupIds = new Set<string>();

      for (const groupId of Object.keys(account.config.groups ?? {})) {
        if (groupId === "*") {
          continue;
        }
        groupIds.add(groupId);
      }
      for (const entry of account.config.groupAllowFrom ?? []) {
        const normalized = normalizeNapCatQQAllowEntry(entry);
        if (normalized) {
          groupIds.add(normalized);
        }
      }

      return Array.from(groupIds)
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group", id, name: `Group ${id}` }));
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getNapCatQQRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, replyToId }) => {
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const isGroup = to.startsWith("group:");
      const targetId = isGroup ? to.replace("group:", "") : to.replace("user:", "");
      try {
        if (isGroup) {
          await sendGroupMessage(aid, targetId, replyToId ? [
            { type: "reply", data: { id: replyToId } },
            { type: "text", data: { text } },
          ] : text);
        } else {
          await sendPrivateMessage(aid, targetId, replyToId ? [
            { type: "reply", data: { id: replyToId } },
            { type: "text", data: { text } },
          ] : text);
        }
        return { channel: "napcatqq", ok: true };
      } catch (err) {
        return { channel: "napcatqq", ok: false, error: String(err) };
      }
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) => {
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const isGroup = to.startsWith("group:");
      const targetId = isGroup ? to.replace("group:", "") : to.replace("user:", "");
      const combined = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      try {
        if (isGroup) {
          await sendGroupMessage(aid, targetId, replyToId ? [
            { type: "reply", data: { id: replyToId } },
            { type: "text", data: { text: combined } },
          ] : combined);
        } else {
          await sendPrivateMessage(aid, targetId, replyToId ? [
            { type: "reply", data: { id: replyToId } },
            { type: "text", data: { text: combined } },
          ] : combined);
        }
        return { channel: "napcatqq", ok: true };
      } catch (err) {
        return { channel: "napcatqq", ok: false, error: String(err) };
      }
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      connected: false,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildChannelSummary: ({ account, snapshot }) => ({
      configured: snapshot.configured ?? false,
      wsPort: account.wsPort,
      wsHost: account.wsHost,
      wsPath: account.wsPath,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ cfg, account, timeoutMs }) =>
      probeNapCatQQ(cfg as CoreConfig, { accountId: account.accountId, timeoutMs }),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      wsPort: account.wsPort,
      wsHost: account.wsHost,
      wsPath: account.wsPath,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.configured) {
        throw new Error(
          `NapCatQQ is not configured for account "${account.accountId}" (need wsPort in channels.napcatqq).`,
        );
      }
      ctx.log?.info(
        `[${account.accountId}] starting NapCatQQ provider (ws://${account.wsHost}:${account.wsPort}${account.wsPath})`,
      );
      const { stop } = await monitorNapCatQQProvider({
        accountId: account.accountId,
        config: ctx.cfg as CoreConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
      return { stop };
    },
  },
};
