import {
  isAuthInvalidationSignal,
  startAuthChannel,
  type AuthInvalidationMessage,
} from "./channel.ts";
import {
  clearAuthenticated,
  getGeneration,
  getSnapshot,
  isCurrentGeneration,
  setRetryableError,
  setUnauthenticated,
} from "./store.ts";
import {
  mirrorKoraSession,
  readLegacyKoraSession,
  removeLegacyKoraSession,
} from "./session.ts";

let bootstrapPromise: Promise<void> | null = null;
let channelStarted = false;

/**
 * The shared cross-tab channel carries both genuine invalidation signals
 * (logout, session-invalidated, auth-generation-changed) and
 * refresh/coordination lifecycle signals (refresh-start/-complete/-failed).
 * Only the former may clear a peer tab's authenticated state; a lifecycle
 * signal describes an in-progress refresh elsewhere and must be ignored
 * here, or every other tab would be logged out mid-refresh.
 */
export function handleCrossTabInvalidation(
  message: AuthInvalidationMessage,
): void {
  if (!isAuthInvalidationSignal(message)) return;

  clearAuthenticated();
  removeLegacyKoraSession();
}

function ensureAuthChannel(): void {
  if (channelStarted) return;
  channelStarted = true;
  startAuthChannel(handleCrossTabInvalidation);
}

/**
 * Hydrate the memory store from the existing legacy session exactly once per
 * bootstrap attempt. No network request or cookie refresh occurs in B1.
 */
export async function bootstrapAuth(): Promise<void> {
  ensureAuthChannel();

  const current = getSnapshot();
  if (current.state === "AUTHENTICATED" || current.state === "UNAUTHENTICATED") {
    return;
  }

  if (bootstrapPromise) return bootstrapPromise;

  const generation = getGeneration();
  bootstrapPromise = (async () => {
    const result = readLegacyKoraSession();
    await Promise.resolve();

    if (!isCurrentGeneration(generation)) return;

    if (result.kind === "valid") {
      mirrorKoraSession(result.session, generation);
      return;
    }

    if (result.kind === "unavailable") {
      setRetryableError({ code: "STORAGE_UNAVAILABLE" }, generation);
      return;
    }

    setUnauthenticated(generation);
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export function resetBootstrapForTests(): void {
  bootstrapPromise = null;
  channelStarted = false;
}
