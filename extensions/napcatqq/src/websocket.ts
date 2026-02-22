import { randomUUID } from "crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type {
  OneBotEvent,
  OneBotMessageEvent,
  OneBotMetaEvent,
  OneBotNoticeEvent,
  OneBotRequest,
  OneBotRequestEvent,
  OneBotResponse,
  OneBotSendMsgResult,
  OneBotGetLoginInfoResult,
  OneBotMessage,
  OneBotFileSegment,
  OneBotUploadPrivateFileParams,
  OneBotUploadGroupFileParams,
  OneBotSendFileResult,
} from "./onebot-types.js";
import type { NapCatQQInboundMessage, NapCatQQRuntimeState, ResolvedNapCatQQAccount } from "./types.js";
import { updateNapCatQQAccountState } from "./runtime.js";

export type NapCatQQConnection = {
  id: string;
  accountId: string;
  ws: WebSocket;
  selfId?: number;
  nickname?: string;
  connectedAt: number;
  lastHeartbeat?: number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  pendingRequests: Map<string | number, {
    resolve: (value: OneBotResponse) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
};

type MessageHandler = (message: NapCatQQInboundMessage, accountId: string) => Promise<void> | void;

type ReconnectConfig = {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
};

type HeartbeatConfig = {
  enabled: boolean;
  interval: number;
  timeout: number;
};

const connections = new Map<string, NapCatQQConnection>();
const accountConnections = new Map<string, NapCatQQConnection>();
let messageHandler: MessageHandler | null = null;
const reconnectConfigs = new Map<string, ReconnectConfig>();
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const heartbeatConfigs = new Map<string, HeartbeatConfig>();
let globalWss: WebSocketServer | null = null;
let globalAccountConfig: Map<string, ResolvedNapCatQQAccount> = new Map();

export function setMessageHandler(handler: MessageHandler): void {
  messageHandler = handler;
}

export function getConnections(): NapCatQQConnection[] {
  return Array.from(connections.values());
}

export function getConnectionByAccount(accountId: string): NapCatQQConnection | undefined {
  return accountConnections.get(accountId);
}

export function isNapCatQQConnected(accountId: string): boolean {
  return accountConnections.has(accountId);
}

export function setReconnectConfig(accountId: string, config: Partial<ReconnectConfig>): void {
  const existing = reconnectConfigs.get(accountId) ?? {
    enabled: true,
    maxRetries: 10,
    retryDelay: 1000,
    backoffMultiplier: 1.5,
    maxDelay: 30000,
  };
  reconnectConfigs.set(accountId, { ...existing, ...config });
}

export function getReconnectConfig(accountId: string): ReconnectConfig {
  return reconnectConfigs.get(accountId) ?? {
    enabled: true,
    maxRetries: 10,
    retryDelay: 1000,
    backoffMultiplier: 1.5,
    maxDelay: 30000,
  };
}

export function setHeartbeatConfig(accountId: string, config: Partial<HeartbeatConfig>): void {
  const existing = heartbeatConfigs.get(accountId) ?? {
    enabled: true,
    interval: 30000,
    timeout: 5000,
  };
  heartbeatConfigs.set(accountId, { ...existing, ...config });
}

export function getHeartbeatConfig(accountId: string): HeartbeatConfig {
  return heartbeatConfigs.get(accountId) ?? {
    enabled: true,
    interval: 30000,
    timeout: 5000,
  };
}

export function resetReconnectAttempts(accountId: string): void {
  reconnectAttempts.set(accountId, 0);
}

export function getReconnectAttempts(accountId: string): number {
  return reconnectAttempts.get(accountId) ?? 0;
}

function calculateReconnectDelay(accountId: string): number {
  const config = getReconnectConfig(accountId);
  const attempts = getReconnectAttempts(accountId);
  const delay = config.retryDelay * Math.pow(config.backoffMultiplier, attempts);
  return Math.min(delay, config.maxDelay);
}

function scheduleReconnect(accountId: string, wss: WebSocketServer, account: ResolvedNapCatQQAccount): void {
  const config = getReconnectConfig(accountId);
  if (!config.enabled) {
    console.log(`[napcatqq] reconnect disabled for account=${accountId}`);
    return;
  }

  const attempts = getReconnectAttempts(accountId);
  if (attempts >= config.maxRetries) {
    console.log(`[napcatqq] max reconnect attempts reached for account=${accountId}`);
    return;
  }

  const existingTimer = reconnectTimers.get(accountId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = calculateReconnectDelay(accountId);
  reconnectAttempts.set(accountId, attempts + 1);

  console.log(`[napcatqq] scheduling reconnect for account=${accountId} in ${delay}ms (attempt ${attempts + 1}/${config.maxRetries})`);

  const timer = setTimeout(() => {
    reconnectTimers.delete(accountId);
    console.log(`[napcatqq] attempting reconnect for account=${accountId}`);
  }, delay);

  reconnectTimers.set(accountId, timer);
}

function startHeartbeat(connection: NapCatQQConnection): void {
  const config = getHeartbeatConfig(connection.accountId);
  if (!config.enabled) {
    return;
  }

  if (connection.heartbeatTimer) {
    clearInterval(connection.heartbeatTimer);
  }

  connection.heartbeatTimer = setInterval(async () => {
    try {
      const response = await sendRequest(connection, "get_status", {});
      if (response.status === "ok") {
        connection.lastHeartbeat = Date.now();
        updateNapCatQQAccountState(connection.accountId, {
          lastInboundAt: Date.now(),
        });
      }
    } catch (err) {
      console.error(`[napcatqq] heartbeat failed for account=${connection.accountId}: ${err}`);
    }
  }, config.interval);

  console.log(`[napcatqq] heartbeat started for account=${connection.accountId} (interval=${config.interval}ms)`);
}

function stopHeartbeat(connection: NapCatQQConnection): void {
  if (connection.heartbeatTimer) {
    clearInterval(connection.heartbeatTimer);
    connection.heartbeatTimer = undefined;
    console.log(`[napcatqq] heartbeat stopped for account=${connection.accountId}`);
  }
}

export function initializeReconnect(wss: WebSocketServer, accounts: Map<string, ResolvedNapCatQQAccount>): void {
  globalWss = wss;
  globalAccountConfig = accounts;
}

export function cleanupReconnect(accountId: string): void {
  const timer = reconnectTimers.get(accountId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(accountId);
  }
  reconnectAttempts.delete(accountId);
  reconnectConfigs.delete(accountId);
  heartbeatConfigs.delete(accountId);
}

function extractTextFromMessage(message: OneBotMessageEvent["message"]): string {
  if (typeof message === "string") {
    return message;
  }
  if (!Array.isArray(message)) {
    return "";
  }
  return message
    .filter((seg): seg is { type: "text"; data: { text: string } } => seg.type === "text")
    .map((seg) => seg.data.text)
    .join("");
}

function findReplySegment(message: OneBotMessageEvent["message"]): string | number | undefined {
  if (typeof message === "string" || !Array.isArray(message)) {
    return undefined;
  }
  const replySeg = message.find((seg) => seg.type === "reply");
  return replySeg?.data?.id as string | number | undefined;
}

function normalizeInboundMessage(event: OneBotMessageEvent): NapCatQQInboundMessage {
  const isGroup = event.message_type === "group";
  const target = isGroup ? `group:${event.group_id}` : `user:${event.user_id}`;

  return {
    messageId: event.message_id,
    target,
    senderId: event.user_id,
    senderNick: event.sender.nickname,
    senderCard: event.sender.card,
    text: extractTextFromMessage(event.message),
    timestamp: event.time * 1000,
    isGroup,
    groupId: isGroup ? event.group_id : undefined,
    rawMessage: typeof event.message === "string" ? [{ type: "text", data: { text: event.message } }] : event.message,
    replyToId: findReplySegment(event.message),
  };
}

function handleOneBotEvent(connection: NapCatQQConnection, event: OneBotEvent): void {
  if (event.post_type === "meta_event") {
    handleMetaEvent(connection, event);
    return;
  }

  if (event.post_type === "message") {
    const inbound = normalizeInboundMessage(event);
    updateNapCatQQAccountState(connection.accountId, { lastInboundAt: Date.now() });
    if (messageHandler) {
      Promise.resolve(messageHandler(inbound, connection.accountId)).catch((err: Error) => {
        console.error(`[napcatqq] message handler error: ${err}`);
      });
    }
    return;
  }

  if (event.post_type === "notice") {
    handleNoticeEvent(connection, event);
    return;
  }

  if (event.post_type === "request") {
    handleRequestEvent(connection, event);
    return;
  }
}

function handleNoticeEvent(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { notice_type } = event;

  switch (notice_type) {
    case "group_increase":
      handleGroupIncreaseNotice(connection, event);
      break;
    case "group_decrease":
      handleGroupDecreaseNotice(connection, event);
      break;
    case "group_admin":
      handleGroupAdminNotice(connection, event);
      break;
    case "group_recall":
      handleGroupRecallNotice(connection, event);
      break;
    case "friend_recall":
      handleFriendRecallNotice(connection, event);
      break;
    case "friend_add":
      handleFriendAddNotice(connection, event);
      break;
    case "group_ban":
      handleGroupBanNotice(connection, event);
      break;
    case "notify":
      handleNotifyNotice(connection, event);
      break;
    default:
      console.log(`[napcatqq] unhandled notice type: ${notice_type}`);
  }
}

function handleGroupIncreaseNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { group_id, user_id, sub_type, operator_id } = event;
  console.log(
    `[napcatqq] group_increase: group=${group_id} user=${user_id} type=${sub_type} operator=${operator_id ?? "system"}`,
  );
}

function handleGroupDecreaseNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { group_id, user_id, sub_type, operator_id } = event;
  console.log(
    `[napcatqq] group_decrease: group=${group_id} user=${user_id} type=${sub_type} operator=${operator_id ?? "self"}`,
  );

  if (sub_type === "kick_me") {
    console.log(`[napcatqq] bot kicked from group=${group_id}`);
  }
}

function handleGroupAdminNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { group_id, user_id, sub_type } = event;
  console.log(
    `[napcatqq] group_admin: group=${group_id} user=${user_id} action=${sub_type}`,
  );
}

function handleGroupRecallNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { group_id, user_id, operator_id, message_id } = event;
  console.log(
    `[napcatqq] group_recall: group=${group_id} user=${user_id} operator=${operator_id} msg=${message_id}`,
  );
}

function handleFriendRecallNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { user_id, message_id } = event;
  console.log(`[napcatqq] friend_recall: user=${user_id} msg=${message_id}`);
}

function handleFriendAddNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { user_id } = event;
  console.log(`[napcatqq] friend_add: user=${user_id}`);
}

function handleGroupBanNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { group_id, user_id, operator_id, sub_type, duration } = event;
  console.log(
    `[napcatqq] group_ban: group=${group_id} user=${user_id} operator=${operator_id} type=${sub_type} duration=${duration}`,
  );
}

function handleNotifyNotice(connection: NapCatQQConnection, event: OneBotNoticeEvent): void {
  const { sub_type, group_id, user_id, target_id } = event;
  console.log(
    `[napcatqq] notify: type=${sub_type} group=${group_id ?? "private"} user=${user_id} target=${target_id}`,
  );
}

function handleRequestEvent(connection: NapCatQQConnection, event: OneBotRequestEvent): void {
  const { request_type, sub_type, user_id, group_id, comment, flag } = event;

  if (request_type === "friend") {
    console.log(`[napcatqq] friend_request: user=${user_id} comment=${comment ?? ""} flag=${flag}`);
  } else if (request_type === "group") {
    console.log(
      `[napcatqq] group_request: group=${group_id} user=${user_id} type=${sub_type} comment=${comment ?? ""} flag=${flag}`,
    );
  }
}

function handleMetaEvent(connection: NapCatQQConnection, event: OneBotMetaEvent): void {
  if (event.meta_event_type === "lifecycle") {
    if (event.sub_type === "connect") {
      connection.selfId = event.self_id;
      updateNapCatQQAccountState(connection.accountId, {
        connected: true,
        selfId: event.self_id,
        connectedAt: Date.now(),
      });
      console.log(`[napcatqq] account=${connection.accountId} connected self_id=${event.self_id}`);
    }
    return;
  }

  if (event.meta_event_type === "heartbeat") {
    connection.lastHeartbeat = Date.now();
    const statePatch: Partial<NapCatQQRuntimeState> = {
      lastHeartbeat: Date.now(),
    };
    updateNapCatQQAccountState(connection.accountId, statePatch);
    return;
  }
}

function handleOneBotResponse(connection: NapCatQQConnection, response: OneBotResponse): void {
  if (response.echo === undefined) {
    return;
  }
  const pending = connection.pendingRequests.get(response.echo);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  connection.pendingRequests.delete(response.echo);
  pending.resolve(response);
}

async function sendRequest(
  connection: NapCatQQConnection,
  action: string,
  params: Record<string, unknown>,
  echo?: string | number,
): Promise<OneBotResponse> {
  return new Promise((resolve, reject) => {
    const echoId = echo ?? randomUUID();
    const request: OneBotRequest = { action, params, echo: echoId };

    const timeoutMs = 30000;
    const timer = setTimeout(() => {
      connection.pendingRequests.delete(echoId);
      reject(new Error(`OneBot API request timeout: ${action}`));
    }, timeoutMs);

    connection.pendingRequests.set(echoId, { resolve, reject, timer });

    try {
      connection.ws.send(JSON.stringify(request));
    } catch (err) {
      clearTimeout(timer);
      connection.pendingRequests.delete(echoId);
      reject(err);
    }
  });
}

export async function sendPrivateMessage(
  accountId: string,
  userId: number | string,
  message: string | OneBotMessage,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const response = await sendRequest(connection, "send_private_msg", {
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    message,
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendGroupMessage(
  accountId: string,
  groupId: number | string,
  message: string | OneBotMessage,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const response = await sendRequest(connection, "send_group_msg", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    message,
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function getLoginInfo(accountId: string): Promise<OneBotResponse<OneBotGetLoginInfoResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  return sendRequest(connection, "get_login_info", {}) as Promise<OneBotResponse<OneBotGetLoginInfoResult>>;
}

export async function deleteMessage(accountId: string, messageId: string | number): Promise<OneBotResponse> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  return sendRequest(connection, "delete_msg", { message_id: messageId });
}

export async function sendPrivateFile(
  accountId: string,
  userId: number | string,
  file: string,
  name?: string,
): Promise<OneBotResponse<OneBotSendFileResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const response = await sendRequest(connection, "upload_private_file", {
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    file,
    name: name || file.split("/").pop() || "file",
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendFileResult>;
}

export async function sendGroupFile(
  accountId: string,
  groupId: number | string,
  file: string,
  name?: string,
  folder?: string,
): Promise<OneBotResponse<OneBotSendFileResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const response = await sendRequest(connection, "upload_group_file", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    file,
    name: name || file.split("/").pop() || "file",
    folder,
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendFileResult>;
}

export async function sendPrivateFileMessage(
  accountId: string,
  userId: number | string,
  file: string,
  name?: string,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const fileSegment: OneBotFileSegment = {
    type: "file",
    data: {
      file,
      name: name || file.split("/").pop() || "file",
    },
  };

  const response = await sendRequest(connection, "send_private_msg", {
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    message: [fileSegment],
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendGroupFileMessage(
  accountId: string,
  groupId: number | string,
  file: string,
  name?: string,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const fileSegment: OneBotFileSegment = {
    type: "file",
    data: {
      file,
      name: name || file.split("/").pop() || "file",
    },
  };

  const response = await sendRequest(connection, "send_group_msg", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    message: [fileSegment],
  });

  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendMarkdownMessage(
  accountId: string,
  targetId: number | string,
  content: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const markdownSegment = {
    type: "markdown" as const,
    data: { content },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [markdownSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [markdownSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendMiniAppMessage(
  accountId: string,
  targetId: number | string,
  miniAppData: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const miniAppSegment = {
    type: "miniapp" as const,
    data: { data: miniAppData },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [miniAppSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [miniAppSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendMFaceMessage(
  accountId: string,
  targetId: number | string,
  emojiPackageId: number,
  emojiId: string,
  key: string,
  summary: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const mfaceSegment = {
    type: "mface" as const,
    data: {
      emoji_package_id: emojiPackageId,
      emoji_id: emojiId,
      key,
      summary,
    },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [mfaceSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [mfaceSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendDiceMessage(
  accountId: string,
  targetId: number | string,
  result?: number | string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const diceSegment = {
    type: "dice" as const,
    data: result !== undefined ? { result } : {},
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [diceSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [diceSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendRPSMessage(
  accountId: string,
  targetId: number | string,
  result?: number | string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const rpsSegment = {
    type: "rps" as const,
    data: result !== undefined ? { result } : {},
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [rpsSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [rpsSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendPokeMessage(
  accountId: string,
  targetId: number | string,
  pokeType: string,
  pokeId: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const pokeSegment = {
    type: "poke" as const,
    data: { type: pokeType, id: pokeId },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [pokeSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [pokeSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendJsonMessage(
  accountId: string,
  targetId: number | string,
  jsonData: string | object,
  token?: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const jsonSegment: { type: "json"; data: { data: string | object; config?: { token: string } } } = {
    type: "json",
    data: { data: jsonData },
  };
  if (token) {
    jsonSegment.data.config = { token };
  }

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [jsonSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [jsonSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendXmlMessage(
  accountId: string,
  targetId: number | string,
  xmlData: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const xmlSegment = {
    type: "xml" as const,
    data: { data: xmlData },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [xmlSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [xmlSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function sendLocationMessage(
  accountId: string,
  targetId: number | string,
  lat: number | string,
  lon: number | string,
  title?: string,
  content?: string,
  isGroup: boolean = false,
): Promise<OneBotResponse<OneBotSendMsgResult>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }

  const locationSegment = {
    type: "location" as const,
    data: { lat, lon, title, content },
  };

  const action = isGroup ? "send_group_msg" : "send_private_msg";
  const params = isGroup
    ? { group_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [locationSegment] }
    : { user_id: typeof targetId === "string" ? parseInt(targetId, 10) : targetId, message: [locationSegment] };

  const response = await sendRequest(connection, action, params);
  updateNapCatQQAccountState(accountId, { lastOutboundAt: Date.now() });
  return response as OneBotResponse<OneBotSendMsgResult>;
}

export async function getGroupList(
  accountId: string,
): Promise<OneBotResponse<Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_list", {});
  return response as OneBotResponse<Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>>;
}

export async function getGroupInfo(
  accountId: string,
  groupId: number | string,
): Promise<OneBotResponse<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_info", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
  });
  return response as OneBotResponse<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>;
}

export async function getGroupMemberList(
  accountId: string,
  groupId: number | string,
): Promise<OneBotResponse<Array<{ user_id: number; nickname: string; card: string; role: "owner" | "admin" | "member" }>>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_member_list", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
  });
  return response as OneBotResponse<Array<{ user_id: number; nickname: string; card: string; role: "owner" | "admin" | "member" }>>;
}

export async function getGroupMemberInfo(
  accountId: string,
  groupId: number | string,
  userId: number | string,
): Promise<OneBotResponse<{ user_id: number; nickname: string; card: string; role: "owner" | "admin" | "member"; join_time: number }>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_member_info", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
  });
  return response as OneBotResponse<{ user_id: number; nickname: string; card: string; role: "owner" | "admin" | "member"; join_time: number }>;
}

export async function setGroupKick(
  accountId: string,
  groupId: number | string,
  userId: number | string,
  rejectAddRequest: boolean = false,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_kick", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    reject_add_request: rejectAddRequest,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupBan(
  accountId: string,
  groupId: number | string,
  userId: number | string,
  duration: number = 1800,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_ban", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    duration,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupWholeBan(
  accountId: string,
  groupId: number | string,
  enable: boolean = true,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_whole_ban", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    enable,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupAdmin(
  accountId: string,
  groupId: number | string,
  userId: number | string,
  enable: boolean = true,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_admin", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    enable,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupCard(
  accountId: string,
  groupId: number | string,
  userId: number | string,
  card: string,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_card", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
    card,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupName(
  accountId: string,
  groupId: number | string,
  name: string,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_name", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    group_name: name,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupLeave(
  accountId: string,
  groupId: number | string,
  isDismiss: boolean = false,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_leave", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    is_dismiss: isDismiss,
  });
  return response as OneBotResponse<null>;
}

export async function getFriendList(
  accountId: string,
): Promise<OneBotResponse<Array<{ user_id: number; nickname: string; remark: string }>>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_friend_list", {});
  return response as OneBotResponse<Array<{ user_id: number; nickname: string; remark: string }>>;
}

export async function deleteFriend(
  accountId: string,
  userId: number | string,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "delete_friend", {
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
  });
  return response as OneBotResponse<null>;
}

export async function setFriendAddRequest(
  accountId: string,
  flag: string,
  approve: boolean = true,
  remark?: string,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_friend_add_request", {
    flag,
    approve,
    remark,
  });
  return response as OneBotResponse<null>;
}

export async function setGroupAddRequest(
  accountId: string,
  flag: string,
  subType: "add" | "invite",
  approve: boolean = true,
  reason?: string,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_group_add_request", {
    flag,
    sub_type: subType,
    approve,
    reason,
  });
  return response as OneBotResponse<null>;
}

export async function getStrangerInfo(
  accountId: string,
  userId: number | string,
): Promise<OneBotResponse<{ user_id: number; nickname: string; sex: "male" | "female" | "unknown"; age: number }>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_stranger_info", {
    user_id: typeof userId === "string" ? parseInt(userId, 10) : userId,
  });
  return response as OneBotResponse<{ user_id: number; nickname: string; sex: "male" | "female" | "unknown"; age: number }>;
}

export async function getGroupMsgHistory(
  accountId: string,
  groupId: number | string,
  messageSeq?: number,
): Promise<OneBotResponse<Array<{ message_id: string; real_id: string; sender: { user_id: number; nickname: string }; message: unknown; time: number }>>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_msg_history", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    message_seq: messageSeq,
  });
  return response as OneBotResponse<Array<{ message_id: string; real_id: string; sender: { user_id: number; nickname: string }; message: unknown; time: number }>>;
}

export async function deleteMsg(
  accountId: string,
  messageId: string | number,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "delete_msg", {
    message_id: messageId,
  });
  return response as OneBotResponse<null>;
}

export async function setEssenceMsg(
  accountId: string,
  messageId: string | number,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_essence_msg", {
    message_id: messageId,
  });
  return response as OneBotResponse<null>;
}

export async function deleteEssenceMsg(
  accountId: string,
  messageId: string | number,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "delete_essence_msg", {
    message_id: messageId,
  });
  return response as OneBotResponse<null>;
}

export async function getGroupFileUrl(
  accountId: string,
  groupId: number | string,
  fileId: string,
  busid: number,
): Promise<OneBotResponse<{ url: string }>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_file_url", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
    file_id: fileId,
    busid,
  });
  return response as OneBotResponse<{ url: string }>;
}

export async function getGroupRootFiles(
  accountId: string,
  groupId: number | string,
): Promise<OneBotResponse<{ files: Array<{ file_id: string; file_name: string; busid: number; file_size: number }>; folders: Array<{ folder_id: string; folder_name: string }> }>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_group_root_files", {
    group_id: typeof groupId === "string" ? parseInt(groupId, 10) : groupId,
  });
  return response as OneBotResponse<{ files: Array<{ file_id: string; file_name: string; busid: number; file_size: number }>; folders: Array<{ folder_id: string; folder_name: string }> }>;
}

export async function getOnlineClients(
  accountId: string,
): Promise<OneBotResponse<Array<{ app_id: number; device_name: string; device_kind: string }>>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "get_online_clients", {});
  return response as OneBotResponse<Array<{ app_id: number; device_name: string; device_kind: string }>>;
}

export async function setOnlineStatus(
  accountId: string,
  status: number,
): Promise<OneBotResponse<null>> {
  const connection = getConnectionByAccount(accountId);
  if (!connection) {
    throw new Error(`NapCatQQ account ${accountId} not connected`);
  }
  const response = await sendRequest(connection, "set_online_status", {
    status,
  });
  return response as OneBotResponse<null>;
}

function handleWsMessage(connection: NapCatQQConnection, data: string): void {
  try {
    const parsed = JSON.parse(data);

    if ("post_type" in parsed) {
      handleOneBotEvent(connection, parsed as OneBotEvent);
    } else if ("status" in parsed && "retcode" in parsed) {
      handleOneBotResponse(connection, parsed as OneBotResponse);
    }
  } catch (err) {
    console.error(`[napcatqq] failed to parse message: ${err}`);
  }
}

function handleWsClose(connection: NapCatQQConnection): void {
  stopHeartbeat(connection);
  connections.delete(connection.id);
  accountConnections.delete(connection.accountId);

  for (const pending of connection.pendingRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("WebSocket connection closed"));
  }
  connection.pendingRequests.clear();

  updateNapCatQQAccountState(connection.accountId, {
    connected: false,
    running: false,
    lastStopAt: Date.now(),
  });

  console.log(`[napcatqq] account=${connection.accountId} disconnected`);
}

export function createNapCatQQWsHandler(account: ResolvedNapCatQQAccount) {
  return (ws: WebSocket): void => {
    const connectionId = randomUUID();
    const connection: NapCatQQConnection = {
      id: connectionId,
      accountId: account.accountId,
      ws,
      connectedAt: Date.now(),
      pendingRequests: new Map(),
    };

    connections.set(connectionId, connection);
    accountConnections.set(account.accountId, connection);

    resetReconnectAttempts(account.accountId);

    updateNapCatQQAccountState(account.accountId, {
      accountId: account.accountId,
      connected: true,
      running: true,
      lastStartAt: Date.now(),
      lastStopAt: null,
      lastError: null,
    });

    startHeartbeat(connection);

    console.log(`[napcatqq] account=${account.accountId} ws connected`);

    ws.on("message", (data: Buffer | string) => {
      const dataStr = Buffer.isBuffer(data) ? data.toString("utf-8") : String(data);
      handleWsMessage(connection, dataStr);
    });

    ws.on("close", () => {
      handleWsClose(connection);
    });

    ws.on("error", (err: Error) => {
      console.error(`[napcatqq] account=${account.accountId} ws error: ${err}`);
      handleWsClose(connection);
    });
  };
}

export type { WebSocket, WebSocketServer };
