import type { WebSocketServer, WebSocket } from "ws";
import { WebSocketServer as WSServer } from "ws";
import type { CoreConfig, NapCatQQInboundMessage, ResolvedNapCatQQAccount } from "./types.js";
import type { PluginRuntime, OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { setNapCatQQAccountState, getNapCatQQRuntime } from "./runtime.js";
import {
  createNapCatQQWsHandler,
  setMessageHandler,
  sendPrivateMessage,
  sendGroupMessage,
  isNapCatQQConnected,
} from "./websocket.js";
import type { OneBotMessage } from "./onebot-types.js";
import {
  createReplyPrefixOptions,
  logInboundDrop,
  resolveControlCommandGate,
  type BaseProbeResult,
} from "openclaw/plugin-sdk";

type StatusSink = (patch: Record<string, unknown>) => void;

const CHANNEL_ID = "napcatqq" as const;

let wsServers: WebSocketServer[] = [];

async function deliverNapCatQQReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; replyToId?: string };
  target: string;
  accountId: string;
  isGroup: boolean;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}): Promise<void> {
  const text = params.payload.text ?? "";
  const mediaList = params.payload.mediaUrls?.length
    ? params.payload.mediaUrls
    : params.payload.mediaUrl
      ? [params.payload.mediaUrl]
      : [];

  if (!text.trim() && mediaList.length === 0) {
    return;
  }

  const mediaBlock = mediaList.length
    ? mediaList.map((url) => `Attachment: ${url}`).join("\n")
    : "";
  const combined = text.trim()
    ? mediaBlock
      ? `${text.trim()}\n\n${mediaBlock}`
      : text.trim()
    : mediaBlock;

  const isGroup = params.isGroup;
  const targetId = params.target.replace(/^(group:|user:)/, "");

  let message: string | OneBotMessage = combined;
  if (params.payload.replyToId) {
    message = [
      { type: "reply", data: { id: params.payload.replyToId } },
      { type: "text", data: { text: combined } },
    ];
  }

  try {
    if (isGroup) {
      await sendGroupMessage(params.accountId, targetId, message);
    } else {
      await sendPrivateMessage(params.accountId, targetId, message);
    }
    params.statusSink?.({ lastOutboundAt: Date.now() });
  } catch (err) {
    console.error(`[napcatqq] failed to send message: ${err}`);
    throw err;
  }
}

async function handleNapCatQQInbound(params: {
  message: NapCatQQInboundMessage;
  account: ResolvedNapCatQQAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, account, config, runtime, statusSink } = params;
  const core = getNapCatQQRuntime();

  const rawBody = message.text?.trim() ?? "";
  if (!rawBody) {
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  const senderDisplay = message.senderCard
    ? `${message.senderCard} (${message.senderId})`
    : String(message.senderId);

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const groupPolicy = account.config.groupPolicy ?? "allowlist";

  const effectiveAllowFrom = account.config.allowFrom ?? [];
  const effectiveGroupAllowFrom = account.config.groupAllowFrom ?? [];

  const groupMatch = {
    groupConfig: message.groupId ? account.config.groups?.[String(message.groupId)] : undefined,
    wildcardConfig: undefined as undefined,
  };

  if (message.isGroup) {
    const groupAccessAllowed = groupPolicy === "open" ||
      (groupPolicy === "allowlist" && effectiveGroupAllowFrom.length > 0);
    if (!groupAccessAllowed && groupPolicy === "disabled") {
      runtime.log?.(`napcatqq: drop group ${message.groupId} (policy=disabled)`);
      return;
    }
  }

  if (!message.isGroup) {
    if (dmPolicy === "closed") {
      runtime.log?.(`napcatqq: drop DM sender=${senderDisplay} (dmPolicy=closed)`);
      return;
    }

    if (dmPolicy === "pairing") {
      const senderIdLower = String(message.senderId).toLowerCase();
      const isAllowed = effectiveAllowFrom.some(
        (id) => String(id).toLowerCase() === senderIdLower
      );
      if (!isAllowed) {
        const { code, created } = await core.channel.pairing.upsertPairingRequest({
          channel: CHANNEL_ID,
          id: senderIdLower,
          meta: { name: message.senderNick || undefined },
        });
        if (created) {
          try {
            const reply = core.channel.pairing.buildPairingReply({
              channel: CHANNEL_ID,
              idLine: `Your QQ id: ${message.senderId}`,
              code,
            });
            await deliverNapCatQQReply({
              payload: { text: reply },
              target: `user:${message.senderId}`,
              accountId: account.accountId,
              isGroup: false,
              statusSink,
            });
          } catch (err) {
            runtime.error?.(`napcatqq: pairing reply failed for ${senderDisplay}: ${String(err)}`);
          }
        }
        runtime.log?.(`napcatqq: drop DM sender ${senderDisplay} (dmPolicy=pairing)`);
        return;
      }
    }
  }

  const peerId = message.isGroup ? String(message.groupId) : String(message.senderId);
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: message.isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  const fromLabel = message.isGroup ? String(message.groupId) : senderDisplay;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "NapCatQQ",
    from: fromLabel,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const groupSystemPrompt = groupMatch.groupConfig?.systemPrompt?.trim() || undefined;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: message.isGroup ? `napcatqq:group:${message.groupId}` : `napcatqq:${senderDisplay}`,
    To: `napcatqq:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: message.isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: message.senderNick || undefined,
    SenderId: String(message.senderId),
    GroupSubject: message.isGroup ? String(message.groupId) : undefined,
    GroupSystemPrompt: message.isGroup ? groupSystemPrompt : undefined,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: String(message.messageId),
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `napcatqq:${peerId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`napcatqq: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        await deliverNapCatQQReply({
          payload: payload as {
            text?: string;
            mediaUrls?: string[];
            mediaUrl?: string;
            replyToId?: string;
          },
          target: message.isGroup ? `group:${message.groupId}` : `user:${message.senderId}`,
          accountId: account.accountId,
          isGroup: message.isGroup,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(`napcatqq ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      skillFilter: groupMatch.groupConfig?.skills,
      onModelSelected,
    },
  });
}

export async function monitorNapCatQQProvider(params: {
  accountId: string;
  config: CoreConfig;
  runtime: PluginRuntime;
  abortSignal: AbortSignal;
  statusSink?: StatusSink;
}): Promise<{ stop: () => void }> {
  const { accountId, abortSignal, statusSink, config, runtime } = params;

  const accountConfig = config.channels?.napcatqq?.accounts?.[accountId] ?? config.channels?.napcatqq ?? {};

  const wsPort = accountConfig.wsPort ?? config.channels?.napcatqq?.wsPort ?? 3001;
  const wsHost = accountConfig.wsHost ?? config.channels?.napcatqq?.wsHost ?? "127.0.0.1";
  const wsPath = accountConfig.wsPath ?? config.channels?.napcatqq?.wsPath ?? "/onebot/v11/ws";

  const resolvedAccount: ResolvedNapCatQQAccount = {
    accountId,
    name: accountConfig.name,
    enabled: accountConfig.enabled ?? true,
    configured: true,
    config: {
      dmPolicy: accountConfig.dmPolicy ?? "pairing",
      allowFrom: accountConfig.allowFrom ?? [],
      groupPolicy: accountConfig.groupPolicy ?? "allowlist",
      groupAllowFrom: accountConfig.groupAllowFrom ?? [],
      groups: accountConfig.groups ?? {},
      textChunkLimit: accountConfig.textChunkLimit ?? 2000,
      mediaMaxMb: accountConfig.mediaMaxMb ?? 50,
    },
    wsPort: wsPort!,
    wsHost: wsHost!,
    wsPath: wsPath!,
    accessToken: accountConfig.accessToken ?? config.channels?.napcatqq?.accessToken,
  };

  setMessageHandler((message, aid) => {
    handleNapCatQQInbound({
      message,
      account: resolvedAccount,
      config,
      runtime: {
        log: (line: string) => console.log(`[napcatqq] ${line}`),
        error: (line: string) => console.error(`[napcatqq] ${line}`),
      },
      statusSink: (patch) => statusSink?.(patch),
    }).catch((err) => {
      console.error(`[napcatqq] inbound handler error: ${err}`);
    });
  });

  const wss = new WSServer({
    host: wsHost,
    port: wsPort,
    path: wsPath,
  });

  wsServers.push(wss);

  setNapCatQQAccountState(accountId, {
    accountId,
    connected: false,
    running: true,
    lastStartAt: Date.now(),
    lastStopAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
  });

  const wsHandler = createNapCatQQWsHandler(resolvedAccount);

  wss.on("connection", (ws: WebSocket, req) => {
    const authHeader = req.headers.authorization;
    const expectedToken = resolvedAccount.accessToken;

    if (expectedToken) {
      const providedToken = authHeader?.replace(/^Bearer\s+/i, "") || req.headers["x-access-token"];
      if (providedToken !== expectedToken) {
        console.warn(`[napcatqq] unauthorized ws connection attempt`);
        ws.close(1008, "Unauthorized");
        return;
      }
    }

    wsHandler(ws);
  });

  wss.on("error", (err: Error) => {
    console.error(`[napcatqq] ws server error: ${err}`);
    statusSink?.({ lastError: err.message });
  });

  console.log(`[napcatqq] ws server listening on ${wsHost}:${wsPort}${wsPath}`);

  const stop = () => {
    const idx = wsServers.indexOf(wss);
    if (idx >= 0) {
      wsServers.splice(idx, 1);
    }
    wss.close();
    setNapCatQQAccountState(accountId, {
      accountId,
      connected: false,
      running: false,
      lastStopAt: Date.now(),
    });
  };

  abortSignal.addEventListener("abort", stop);

  return { stop };
}

export function stopAllNapCatQQServers(): void {
  for (const wss of wsServers) {
    wss.close();
  }
  wsServers = [];
}
