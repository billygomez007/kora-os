export type AuthInvalidationMessageType =
  | "logout"
  | "session-invalidated"
  | "auth-generation-changed"
  | "refresh-start"
  | "refresh-complete"
  | "refresh-failed";

export type AuthRefreshSignalStatus = "started" | "completed" | "failed";

export interface AuthInvalidationMessage {
  type: AuthInvalidationMessageType;
  source: string;
  generation?: number;
  version?: number;
  status?: AuthRefreshSignalStatus;
}

const CHANNEL_NAME = "kora.auth.v1";
const STORAGE_SIGNAL_KEY = "kora.auth.signal";

let channel: BroadcastChannel | null = null;
let sourceId: string | null = null;
let started = false;
let storageHandler: ((event: StorageEvent) => void) | null = null;
const listeners = new Set<(message: AuthInvalidationMessage) => void>();

function getSourceId(): string {
  if (sourceId) return sourceId;

  sourceId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `kora-${Math.random().toString(36).slice(2)}`;

  return sourceId;
}

function isMessage(value: unknown): value is AuthInvalidationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  const typeIsValid =
    (message.type === "logout" ||
      message.type === "session-invalidated" ||
      message.type === "auth-generation-changed" ||
      message.type === "refresh-start" ||
      message.type === "refresh-complete" ||
      message.type === "refresh-failed") &&
    typeof message.source === "string";

  const generationIsValid =
    message.generation === undefined ||
    (typeof message.generation === "number" &&
      Number.isSafeInteger(message.generation) &&
      message.generation >= 0);
  const versionIsValid =
    message.version === undefined ||
    (typeof message.version === "number" &&
      Number.isSafeInteger(message.version) &&
      message.version >= 0);
  const statusIsValid =
    message.status === undefined ||
    message.status === "started" ||
    message.status === "completed" ||
    message.status === "failed";

  return typeIsValid && generationIsValid && versionIsValid && statusIsValid;
}

export function startAuthChannel(
  onMessage: (message: AuthInvalidationMessage) => void,
): () => void {
  listeners.add(onMessage);

  if (typeof window === "undefined") {
    return () => listeners.delete(onMessage);
  }

  if (started) {
    return () => listeners.delete(onMessage);
  }

  started = true;
  getSourceId();

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      if (!isMessage(event.data) || event.data.source === getSourceId()) {
        return;
      }

      const message = sanitizeMessage(event.data);
      for (const listener of listeners) listener(message);
    });
  }

  storageHandler = (event) => {
    if (event.key !== STORAGE_SIGNAL_KEY || !event.newValue) return;

    try {
      const parsed = JSON.parse(event.newValue) as unknown;
      if (!isMessage(parsed) || parsed.source === getSourceId()) return;

      const message = sanitizeMessage(parsed);
      for (const listener of listeners) listener(message);
    } catch {
      // Ignore malformed cross-tab signals. They never carry credentials.
    }
  };
  window.addEventListener("storage", storageHandler);

  return () => listeners.delete(onMessage);
}

export function broadcastAuthInvalidation(
  type: AuthInvalidationMessageType,
): void {
  broadcastAuthSignal(type);
}

export function broadcastAuthSignal(
  type: AuthInvalidationMessageType,
  metadata: Pick<
    AuthInvalidationMessage,
    "generation" | "version" | "status"
  > = {},
): void {
  if (typeof window === "undefined") return;

  const message: AuthInvalidationMessage = {
    type,
    source: getSourceId(),
    ...metadata,
  };

  if (channel) {
    channel.postMessage(message);
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_SIGNAL_KEY,
      JSON.stringify({ ...message, nonce: Date.now() }),
    );
  } catch {
    // Cross-tab signaling is best effort and never blocks logout.
  }
}

export function resetAuthChannelForTests(): void {
  channel?.close();
  channel = null;

  if (storageHandler && typeof window !== "undefined") {
    window.removeEventListener("storage", storageHandler);
  }

  storageHandler = null;
  sourceId = null;
  started = false;
  listeners.clear();
}

function sanitizeMessage(
  value: AuthInvalidationMessage,
): AuthInvalidationMessage {
  return {
    type: value.type,
    source: value.source,
    ...(value.generation === undefined ? {} : { generation: value.generation }),
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.status === undefined ? {} : { status: value.status }),
  };
}
