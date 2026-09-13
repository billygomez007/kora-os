import { useSyncExternalStore } from "react";

export type AuthState =
  | "UNKNOWN"
  | "AUTHENTICATED"
  | "UNAUTHENTICATED"
  | "RETRYABLE_ERROR";

export type AuthOperationalState =
  | "READY"
  | "OFFLINE"
  | "RETRYABLE_ERROR";

export interface AuthUserSummary {
  id: string;
  email: string | null;
  displayName: string;
}

export interface AuthRetryableError {
  code: "STORAGE_UNAVAILABLE" | "BOOTSTRAP_FAILED";
}

export interface AuthSnapshot {
  state: AuthState;
  operationalState: AuthOperationalState;
  accessToken: string | null;
  accessTokenExpiry: number | null;
  user: AuthUserSummary | null;
  sessionId: string | null;
  sessionExpiresAt: string | null;
  generation: number;
  error: AuthRetryableError | null;
}

export interface AuthenticatedStateInput {
  accessToken: string;
  accessTokenExpiry?: number | null;
  user?: AuthUserSummary | null;
  sessionId?: string | null;
  sessionExpiresAt?: string | null;
}

const UNKNOWN_SNAPSHOT: AuthSnapshot = Object.freeze({
  state: "UNKNOWN",
  operationalState: "READY",
  accessToken: null,
  accessTokenExpiry: null,
  user: null,
  sessionId: null,
  sessionExpiresAt: null,
  generation: 0,
  error: null,
});

let snapshot: AuthSnapshot = UNKNOWN_SNAPSHOT;
const listeners = new Set<() => void>();

function notify(next: AuthSnapshot): void {
  snapshot = Object.freeze(next);
  for (const listener of listeners) listener();
}

function matchesGeneration(expectedGeneration: number | undefined): boolean {
  return (
    expectedGeneration === undefined ||
    expectedGeneration === snapshot.generation
  );
}

function nextGeneration(): number {
  return snapshot.generation + 1;
}

export function getSnapshot(): AuthSnapshot {
  return snapshot;
}

export function getServerSnapshot(): AuthSnapshot {
  return UNKNOWN_SNAPSHOT;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthSnapshot(): AuthSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getGeneration(): number {
  return snapshot.generation;
}

export function isCurrentGeneration(generation: number): boolean {
  return snapshot.generation === generation;
}

export function incrementGeneration(): number {
  const generation = nextGeneration();
  notify({ ...snapshot, generation });
  return generation;
}

export function setAuthenticated(
  input: AuthenticatedStateInput,
  expectedGeneration?: number,
): boolean {
  if (!matchesGeneration(expectedGeneration)) return false;

  notify({
    state: "AUTHENTICATED",
    operationalState: "READY",
    accessToken: input.accessToken,
    accessTokenExpiry: input.accessTokenExpiry ?? null,
    user: input.user ?? null,
    sessionId: input.sessionId ?? null,
    sessionExpiresAt: input.sessionExpiresAt ?? null,
    generation:
      expectedGeneration === undefined
        ? nextGeneration()
        : snapshot.generation,
    error: null,
  });

  return true;
}

/**
 * Commit a newly completed login only if the operation began in the current
 * generation. A successful login advances the generation so older work cannot
 * overwrite the newly established session.
 */
export function commitAuthenticated(
  input: AuthenticatedStateInput,
  expectedGeneration: number,
): boolean {
  if (!matchesGeneration(expectedGeneration)) return false;
  return setAuthenticated(input);
}

export function setUnauthenticated(expectedGeneration?: number): boolean {
  if (!matchesGeneration(expectedGeneration)) return false;

  notify({
    state: "UNAUTHENTICATED",
    operationalState: "READY",
    accessToken: null,
    accessTokenExpiry: null,
    user: null,
    sessionId: null,
    sessionExpiresAt: null,
    generation:
      expectedGeneration === undefined
        ? nextGeneration()
        : snapshot.generation,
    error: null,
  });

  return true;
}

export function clearAuthenticated(): boolean {
  return setUnauthenticated();
}

export function setRetryableError(
  error: AuthRetryableError,
  expectedGeneration?: number,
): boolean {
  if (!matchesGeneration(expectedGeneration)) return false;

  notify({
    ...snapshot,
    state: "RETRYABLE_ERROR",
    operationalState:
      error.code === "STORAGE_UNAVAILABLE" ? "OFFLINE" : "RETRYABLE_ERROR",
    error,
  });

  return true;
}

export function resetForTests(): void {
  snapshot = UNKNOWN_SNAPSHOT;
  listeners.clear();
}
