import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  promptAccountId,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type DmPolicy,
  type GroupPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  listNapCatQQAccountIds,
  resolveDefaultNapCatQQAccountId,
  resolveNapCatQQAccount,
} from "./accounts.js";
import type { CoreConfig, NapCatQQAccountConfig, NapCatQQGroupConfig } from "./types.js";

const channel = "napcatqq" as const;

function parseListInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeGroupEntry(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }
  const numId = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(numId)) {
    return String(numId);
  }
  return null;
}

function updateNapCatQQAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<NapCatQQAccountConfig>,
): CoreConfig {
  const current = cfg.channels?.napcatqq ?? {};
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        napcatqq: {
          ...current,
          ...patch,
        },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      napcatqq: {
        ...current,
        accounts: {
          ...current.accounts,
          [accountId]: {
            ...current.accounts?.[accountId],
            ...patch,
          },
        },
      },
    },
  };
}

function setNapCatQQDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy): CoreConfig {
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(cfg.channels?.napcatqq?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      napcatqq: {
        ...cfg.channels?.napcatqq,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setNapCatQQAllowFrom(cfg: CoreConfig, allowFrom: string[]): CoreConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      napcatqq: {
        ...cfg.channels?.napcatqq,
        allowFrom: allowFrom.map((id) => {
          const num = Number.parseInt(id, 10);
          return Number.isNaN(num) ? id : num;
        }),
      },
    },
  };
}

function mapAccessPolicyToGroupPolicy(
  policy: "allowlist" | "open" | "disabled",
): GroupPolicy {
  return policy;
}

function setNapCatQQGroupAccess(
  cfg: CoreConfig,
  accountId: string,
  policy: "allowlist" | "open" | "disabled",
  entries: string[],
): CoreConfig {
  const mappedPolicy = mapAccessPolicyToGroupPolicy(policy);
  if (mappedPolicy !== "allowlist") {
    return updateNapCatQQAccountConfig(cfg, accountId, { enabled: true, groupPolicy: mappedPolicy });
  }
  const normalizedEntries = [
    ...new Set(
      entries
        .map((entry) => normalizeGroupEntry(entry))
        .filter((entry): entry is string => entry !== null),
    ),
  ];
  const groups: Record<string, NapCatQQGroupConfig> = Object.fromEntries(
    normalizedEntries.map((entry) => [entry, {}]),
  );
  return updateNapCatQQAccountConfig(cfg, accountId, {
    enabled: true,
    groupPolicy: "allowlist",
    groups,
  });
}

async function noteNapCatQQSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "NapCatQQ connects via reverse WebSocket.",
      "OpenClaw acts as WebSocket server, NapCatQQ connects as client.",
      "Required: wsPort (default 3001), accessToken for security.",
      "Configure NapCatQQ with reverse WebSocket URL: ws://host:port/onebot/v11/ws",
      "Set channels.napcatqq.groupPolicy for group access control.",
      "Set channels.napcatqq.dmPolicy for private message control.",
      `Docs: ${formatDocsLink("/channels/napcatqq", "channels/napcatqq")}`,
    ].join("\n"),
    "NapCatQQ setup",
  );
}

async function promptNapCatQQAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<CoreConfig> {
  const existing = params.cfg.channels?.napcatqq?.allowFrom ?? [];

  await params.prompter.note(
    [
      "Allowlist NapCatQQ DMs by QQ number.",
      "Examples:",
      "- 123456789",
      "- 987654321",
      "Multiple entries: comma-separated.",
    ].join("\n"),
    "NapCatQQ allowlist",
  );

  const raw = await params.prompter.text({
    message: "NapCatQQ allowFrom (QQ numbers)",
    placeholder: "123456789, 987654321",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
  });

  const parsed = parseListInput(String(raw));
  const normalized = [
    ...new Set(
      parsed
        .map((entry) => {
          const num = Number.parseInt(entry, 10);
          return Number.isNaN(num) ? null : String(num);
        })
        .filter((entry): entry is string => entry !== null),
    ),
  ];
  return setNapCatQQAllowFrom(params.cfg, normalized);
}

async function promptAccessToken(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<CoreConfig> {
  const resolved = resolveNapCatQQAccount({ cfg: params.cfg, accountId: params.accountId });
  const existing = resolved.accessToken;

  const wants = await params.prompter.confirm({
    message: existing ? "Update access token?" : "Configure access token for security?",
    initialValue: !existing,
  });
  if (!wants) {
    return params.cfg;
  }

  const accessToken = String(
    await params.prompter.text({
      message: "Access token (blank to disable auth)",
      initialValue: existing || undefined,
      validate: () => undefined,
    }),
  ).trim();

  return updateNapCatQQAccountConfig(params.cfg, params.accountId, {
    accessToken: accessToken || undefined,
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "NapCatQQ",
  channel,
  policyKey: "channels.napcatqq.dmPolicy",
  allowFromKey: "channels.napcatqq.allowFrom",
  getCurrent: (cfg) => (cfg as CoreConfig).channels?.napcatqq?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setNapCatQQDmPolicy(cfg as CoreConfig, policy),
  promptAllowFrom: promptNapCatQQAllowFrom,
};

export const napcatqqOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const coreCfg = cfg as CoreConfig;
    const configured = listNapCatQQAccountIds(coreCfg).some(
      (accountId) => resolveNapCatQQAccount({ cfg: coreCfg, accountId }).configured,
    );
    return {
      channel,
      configured,
      statusLines: [`NapCatQQ: ${configured ? "configured" : "needs wsPort"}`],
      selectionHint: configured ? "configured" : "needs wsPort",
      quickstartScore: configured ? 1 : 0,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    let next = cfg as CoreConfig;
    const napcatqqOverride = accountOverrides.napcatqq?.trim() || "";
    const defaultAccountId = resolveDefaultNapCatQQAccountId(next) ?? DEFAULT_ACCOUNT_ID;
    let accountId = napcatqqOverride || defaultAccountId;
    if (shouldPromptAccountIds && !napcatqqOverride) {
      accountId = await promptAccountId({
        cfg: next,
        prompter,
        label: "NapCatQQ",
        currentId: accountId,
        listAccountIds: listNapCatQQAccountIds,
        defaultAccountId,
      });
    }

    const resolved = resolveNapCatQQAccount({ cfg: next, accountId });

    if (!resolved.configured) {
      await noteNapCatQQSetupHelp(prompter);
    }

    const wsPort = Number.parseInt(
      String(
        await prompter.text({
          message: "WebSocket server port",
          initialValue: String(resolved.wsPort || 3001),
          validate: (value) => {
            const parsed = Number.parseInt(String(value ?? "").trim(), 10);
            return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535
              ? undefined
              : "Use a port between 1 and 65535";
          },
        }),
      ),
      10,
    );

    const wsHost = String(
      await prompter.text({
        message: "WebSocket server host",
        initialValue: resolved.wsHost || "127.0.0.1",
        validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
      }),
    ).trim();

    const wsPath = String(
      await prompter.text({
        message: "WebSocket path",
        initialValue: resolved.wsPath || "/onebot/v11/ws",
        validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
      }),
    ).trim();

    next = updateNapCatQQAccountConfig(next, accountId, {
      enabled: true,
      wsPort,
      wsHost,
      wsPath,
    });

    next = await promptAccessToken({ cfg: next, prompter, accountId });

    const afterConfig = resolveNapCatQQAccount({ cfg: next, accountId });
    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "NapCatQQ groups",
      currentPolicy: afterConfig.config.groupPolicy ?? "allowlist",
      currentEntries: Object.keys(afterConfig.config.groups ?? {}),
      placeholder: "123456789, 987654321, *",
      updatePrompt: Boolean(afterConfig.config.groups),
    });
    if (accessConfig) {
      next = setNapCatQQGroupAccess(next, accountId, accessConfig.policy, accessConfig.entries);

      const wantsMentions = await prompter.confirm({
        message: "Require @mention to reply in QQ groups?",
        initialValue: true,
      });
      if (!wantsMentions) {
        const resolvedAfter = resolveNapCatQQAccount({ cfg: next, accountId });
        const groups = resolvedAfter.config.groups ?? {};
        const patched = Object.fromEntries(
          Object.entries(groups).map(([key, value]) => [key, { ...value, requireMention: false }]),
        );
        next = updateNapCatQQAccountConfig(next, accountId, { groups: patched });
      }
    }

    if (forceAllowFrom) {
      next = await promptNapCatQQAllowFrom({ cfg: next, prompter, accountId });
    }

    await prompter.note(
      [
        "Next steps:",
        "1. Configure NapCatQQ to connect via reverse WebSocket:",
        `   URL: ws://${wsHost}:${wsPort}${wsPath}`,
        "2. Ensure accessToken matches on both sides",
        "3. Restart gateway: openclaw gateway run",
        "4. Check status: openclaw channels status --probe",
        `Docs: ${formatDocsLink("/channels/napcatqq", "channels/napcatqq")}`,
      ].join("\n"),
      "NapCatQQ next steps",
    );

    return { cfg: next, accountId };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...(cfg as CoreConfig),
    channels: {
      ...(cfg as CoreConfig).channels,
      napcatqq: {
        ...(cfg as CoreConfig).channels?.napcatqq,
        enabled: false,
      },
    },
  }),
};
