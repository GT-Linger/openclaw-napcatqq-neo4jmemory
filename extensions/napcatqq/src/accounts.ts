import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, NapCatQQAccountConfig, NapCatQQConfig, ResolvedNapCatQQAccount, NapCatQQGroupConfig } from "./types.js";
import type { BlockStreamingCoalesceConfig, DmConfig, MarkdownConfig } from "openclaw/plugin-sdk";

export function listNapCatQQAccountIds(cfg: CoreConfig): string[] {
  const napcatqq = cfg.channels?.napcatqq;
  if (!napcatqq) {
    return [];
  }
  const ids = new Set<string>();
  if (napcatqq.wsPort || napcatqq.accessToken) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }
  if (napcatqq.accounts) {
    for (const id of Object.keys(napcatqq.accounts)) {
      if (id !== DEFAULT_ACCOUNT_ID) {
        ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

export function resolveDefaultNapCatQQAccountId(cfg: CoreConfig): string | undefined {
  const ids = listNapCatQQAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0];
}

function resolveAccessToken(account: NapCatQQAccountConfig): string | undefined {
  return account.accessToken?.trim() || undefined;
}

function resolveWsPath(account: NapCatQQAccountConfig): string {
  return account.wsPath?.trim() || "/onebot/v11/ws";
}

export function resolveNapCatQQAccount(params: {
  cfg: CoreConfig;
  accountId?: string;
}): ResolvedNapCatQQAccount {
  const { cfg, accountId } = params;
  const napcatqq = cfg.channels?.napcatqq ?? {};
  const resolvedAccountId = accountId ?? resolveDefaultNapCatQQAccountId(cfg) ?? DEFAULT_ACCOUNT_ID;

  let accountConfig: NapCatQQAccountConfig;
  let isDefault = resolvedAccountId === DEFAULT_ACCOUNT_ID;

  if (isDefault) {
    const { accounts, ...baseConfig } = napcatqq;
    accountConfig = baseConfig as NapCatQQAccountConfig;
  } else {
    accountConfig = napcatqq.accounts?.[resolvedAccountId] ?? {};
  }

  const wsPort = accountConfig.wsPort ?? napcatqq.wsPort ?? 3001;
  const wsHost = accountConfig.wsHost ?? napcatqq.wsHost ?? "127.0.0.1";
  const wsPath = resolveWsPath(accountConfig);
  const accessToken = resolveAccessToken(accountConfig) ?? napcatqq.accessToken;

  const configured = Boolean(wsPort && wsHost);

  return {
    accountId: resolvedAccountId,
    name: accountConfig.name,
    enabled: accountConfig.enabled ?? true,
    configured,
    config: {
      dmPolicy: accountConfig.dmPolicy ?? napcatqq.dmPolicy ?? "pairing",
      allowFrom: accountConfig.allowFrom ?? napcatqq.allowFrom ?? [],
      defaultTo: accountConfig.defaultTo ?? napcatqq.defaultTo,
      groupPolicy: accountConfig.groupPolicy ?? napcatqq.groupPolicy ?? "allowlist",
      groupAllowFrom: accountConfig.groupAllowFrom ?? napcatqq.groupAllowFrom ?? [],
      groups: accountConfig.groups ?? napcatqq.groups ?? {},
      mentionPatterns: accountConfig.mentionPatterns ?? napcatqq.mentionPatterns,
      markdown: accountConfig.markdown ?? napcatqq.markdown,
      historyLimit: accountConfig.historyLimit ?? napcatqq.historyLimit,
      dmHistoryLimit: accountConfig.dmHistoryLimit ?? napcatqq.dmHistoryLimit,
      dms: accountConfig.dms ?? napcatqq.dms,
      textChunkLimit: accountConfig.textChunkLimit ?? napcatqq.textChunkLimit ?? 2000,
      blockStreamingCoalesce: accountConfig.blockStreamingCoalesce ?? napcatqq.blockStreamingCoalesce,
      mediaMaxMb: accountConfig.mediaMaxMb ?? napcatqq.mediaMaxMb ?? 50,
    },
    wsPort,
    wsHost,
    wsPath,
    accessToken,
  };
}
