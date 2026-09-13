export type AuthInvalidationMessageType =
  | "logout"
  | "session-invalidated"
  | "auth-generation-changed";

export interface AuthInvalidationMessage {
  type: AuthInvalidationMessageType;
  source: string;
}

const CHANNEL_NAME = "kora.auth.v1";
const STORAGE_SIGNAL_KEY = "kora.auth.signal";

let channel: BroadcastChannel | null = null;
let sourceId: string | null = null;
let started = false;
let storageHandler: ((event: StorageEvent) => void) | null = null;

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
  return (
    (message.type === "logout" ||
      message.type === "session-invalidated" ||
      message.type === "auth-generation-changed") &&
    typeof message.source === "string"
  );
}

function dispatch(
  value: unknown,
  onMessage: (message: AuthInvalidationMessage) => void,
): void {
  if (!isMessage(value) || value.source === getSourceId()) return;
  onMessage({ type: value.type, source: value.source });
}

export function startAuthChannel(
  onMessage: (message: AuthInvalidationMessage) => void,
): void {
  if (typeof window === "undefined" || started) return;

  started = true;
  getSourceId();

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) =>
      dispatch(event.data, onMessage),
    );
  }

  storageHandler = (event) => {
    if (event.key !== STORAGE_SIGNAL_KEY || !event.newValue) return;

    try {
      dispatch(JSON.parse(event.newValue) as unknown, onMessage);
    } catch {
      // Ignore malformed cross-tab signals. They never carry credentials.
    }
  };
  window.addEventListener("storage", storageHandler);
}

export function broadcastAuthInvalidation(
  type: AuthInvalidationMessageType,
): void {
  if (typeof window === "undefined") return;

  const message: AuthInvalidationMessage = {
    type,
    source: getSourceId(),
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
}
