import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";

export type GatewayClientEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayClientResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string; details?: unknown };
};

export type GatewayClientHelloOk = {
  type: "hello-ok";
  protocol: number;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
};

const PROTOCOL_VERSION = 3;
const CONNECT_TIMEOUT_MS = 12_000;
const CONNECT_DELAY_MS = 750;
const ROLE_OPERATOR = "operator";
const OPERATOR_SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];
const DEVICE_IDENTITY_STORAGE_KEY = "openclaw-device-identity-v1";
const DEVICE_AUTH_STORAGE_KEY = "openclaw.device.auth.v1";

type GatewayClientConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  auth?: { token?: string; password?: string };
  role?: string;
  scopes?: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
  client: {
    id: string;
    version: string;
    mode: string;
    platform: string;
    displayName?: string;
    instanceId?: string;
  };
  caps?: string[];
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type StoredIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
};

type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

type DeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
};

export type GatewayClientOptions = {
  gatewayUrl: string;
  token?: string;
  password?: string;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onEvent?: (event: GatewayClientEventFrame) => void;
  onHello?: (hello: GatewayClientHelloOk) => void;
  onError?: (error: Error) => void;
  onGap?: (args: { expected: number; received: number }) => void;
  reconnect?: boolean;
};

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  return {
    deviceId: await fingerprintPublicKey(publicKey),
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

function readDeviceAuthStore(): DeviceAuthStore | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DEVICE_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.deviceId === "string" &&
      parsed.tokens &&
      typeof parsed.tokens === "object"
    ) {
      return parsed;
    }
  } catch {
    // best-effort
  }
  return null;
}

function writeDeviceAuthStore(store: DeviceAuthStore): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best-effort
  }
}

function loadDeviceAuthToken(params: { deviceId: string; role: string }): DeviceAuthEntry | null {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== params.deviceId) {
    return null;
  }
  const entry = store.tokens[params.role];
  if (!entry || typeof entry.token !== "string") {
    return null;
  }
  return entry;
}

function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): void {
  const role = params.role || ROLE_OPERATOR;
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens: {},
  };
  const current = readDeviceAuthStore();
  if (current && current.deviceId === params.deviceId) {
    next.tokens = { ...current.tokens };
  }
  next.tokens[role] = {
    token: params.token,
    role,
    scopes: Array.isArray(params.scopes) ? params.scopes : [],
    updatedAtMs: Date.now(),
  };
  writeDeviceAuthStore(next);
}

function clearDeviceAuthToken(params: { deviceId: string; role: string }): void {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  if (!store.tokens[params.role]) {
    return;
  }
  const next = {
    ...store,
    tokens: { ...store.tokens },
  };
  delete next.tokens[params.role];
  writeDeviceAuthStore(next);
}

async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === "undefined") {
    throw new Error("device identity unavailable outside browser");
  }

  try {
    const raw = window.localStorage.getItem(DEVICE_IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const repaired: StoredIdentity = { ...parsed, deviceId: derivedId };
          window.localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(repaired));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // regenerate below
  }

  const identity = await generateIdentity();
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  };
  window.localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const privateKey = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const signature = await signAsync(data, privateKey);
  return base64UrlEncode(signature);
}

export class DashboardGatewayClient {
  private readonly options: GatewayClientOptions;
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private connectTimer: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private stopped = false;
  private backoffMs = 800;
  private pending = new Map<string, PendingRequest>();
  private lastSeq: number | null = null;

  constructor(options: GatewayClientOptions) {
    this.options = options;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "client stop");
      this.ws = null;
    }
    for (const pending of this.pending.values()) {
      pending.reject(new Error("gateway client stopped"));
    }
    this.pending.clear();
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = createRequestId();
    const frame = { type: "req", id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  private connect() {
    if (this.stopped) {
      return;
    }

    const ws = new WebSocket(this.options.gatewayUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.options.onOpen?.();
      this.queueConnect();
    });

    ws.addEventListener("error", () => {
      this.options.onError?.(new Error("gateway websocket error"));
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      this.handleMessage(event.data);
    });

    ws.addEventListener("close", (event) => {
      if (this.ws === ws) {
        this.ws = null;
      }
      this.options.onClose?.(event);
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`gateway disconnected (${event.code})`));
      }
      this.pending.clear();
      if (this.stopped || this.options.reconnect === false) {
        return;
      }
      const wait = this.backoffMs;
      this.backoffMs = Math.min(10_000, Math.round(this.backoffMs * 1.75));
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, wait);
    });
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, CONNECT_DELAY_MS);
  }

  private async sendConnect() {
    if (this.connectSent) {
      return;
    }

    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // WebCrypto is available only in secure contexts (HTTPS or localhost).
    const isSecureContext =
      typeof window !== "undefined" && window.isSecureContext && typeof crypto !== "undefined";

    const role = ROLE_OPERATOR;
    const scopes = OPERATOR_SCOPES;

    let deviceIdentity: DeviceIdentity | null = null;
    let canFallbackToShared = false;
    let authToken = this.options.token;

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      const storedToken = loadDeviceAuthToken({
        deviceId: deviceIdentity.deviceId,
        role,
      })?.token;
      authToken = storedToken ?? this.options.token;
      canFallbackToShared = Boolean(storedToken && this.options.token);
    }

    const auth =
      authToken || this.options.password
        ? {
            token: authToken,
            password: this.options.password,
          }
        : undefined;

    let device: GatewayClientConnectParams["device"] | undefined;
    if (isSecureContext && deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: "openclaw-control-ui",
        clientMode: "ui",
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }

    const connectId = createRequestId();
    const connectParams: GatewayClientConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      auth,
      role,
      scopes,
      device,
      caps: [],
      client: {
        id: "openclaw-control-ui",
        version: "next-preview-0",
        mode: "ui",
        platform: typeof navigator === "undefined" ? "browser" : navigator.userAgent,
        displayName: "Next Preview Dashboard",
      },
    };

    ws.send(
      JSON.stringify({ type: "req", id: connectId, method: "connect", params: connectParams }),
    );

    const timeout = window.setTimeout(() => {
      if (this.ws === ws) {
        ws.close(1008, "connect timeout");
      }
    }, CONNECT_TIMEOUT_MS);

    this.pending.set(connectId, {
      resolve: (value) => {
        window.clearTimeout(timeout);
        this.backoffMs = 800;
        const hello = value as GatewayClientHelloOk;
        if (hello.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }
        this.options.onHello?.(hello);
      },
      reject: (error) => {
        window.clearTimeout(timeout);
        const normalizedError =
          error instanceof Error
            ? error
            : new Error(typeof error === "string" ? error : "connect failed");

        const isDeviceTokenMismatch = normalizedError.message
          .toLowerCase()
          .includes("device token mismatch");

        if (deviceIdentity && (canFallbackToShared || isDeviceTokenMismatch)) {
          clearDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role,
          });
        }
        this.options.onError?.(normalizedError);
      },
    });
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const event = parsed as GatewayClientEventFrame;
      if (event.event === "connect.challenge") {
        const payload = event.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }
      if (typeof event.seq === "number") {
        if (this.lastSeq !== null && event.seq > this.lastSeq + 1) {
          this.options.onGap?.({ expected: this.lastSeq + 1, received: event.seq });
        }
        this.lastSeq = event.seq;
      }
      this.options.onEvent?.(event);
      return;
    }

    if (frame.type === "res") {
      const response = parsed as GatewayClientResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        pending.reject(new Error(response.error?.message ?? "request failed"));
      }
    }
  }
}
