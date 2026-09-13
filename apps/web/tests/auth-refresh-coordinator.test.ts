import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  BrowserAccessTokenRecoveryError,
  RefreshCoordinationUnavailableError,
  StaleAuthGenerationError,
  coordinateBrowserRefresh,
  recoverBrowserAccessToken,
  resetRefreshCoordinatorForTests,
} from "../src/lib/auth/refresh-coordinator.ts";
import { resetAuthChannelForTests } from "../src/lib/auth/channel.ts";
import {
  clearAuthenticated,
  getSnapshot,
  resetForTests,
  setAuthenticated,
} from "../src/lib/auth/store.ts";

type FakeChannelListener = (event: { data: unknown }) => void;

class FakeBroadcastChannel {
  static instances = new Set<FakeBroadcastChannel>();
  private listener: FakeChannelListener | null = null;

  constructor(name: string) {
    void name;
    FakeBroadcastChannel.instances.add(this);
  }

  addEventListener(_type: "message", listener: FakeChannelListener): void {
    this.listener = listener;
  }

  removeEventListener(_type: "message", listener: FakeChannelListener): void {
    if (this.listener === listener) this.listener = null;
  }

  postMessage(data: unknown): void {
    for (const instance of FakeBroadcastChannel.instances) {
      if (instance !== this) instance.listener?.({ data });
    }
  }

  close(): void {
    this.listener = null;
    FakeBroadcastChannel.instances.delete(this);
  }
}

function installBrowser(
  lockMode: "leader" | "busy" | "none",
  withBroadcastChannel = false,
): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: undefined,
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });

  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: withBroadcastChannel ? FakeBroadcastChannel : undefined,
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value:
      lockMode === "none"
        ? {}
        : {
            locks: {
              request: async (
                _name: string,
                _options: { ifAvailable: boolean },
                callback: (lock: object | null) => Promise<unknown>,
              ) => callback(lockMode === "leader" ? {} : null),
            },
          },
  });
}

beforeEach(() => {
  FakeBroadcastChannel.instances.clear();
  resetForTests();
  resetAuthChannelForTests();
  resetRefreshCoordinatorForTests();
  installBrowser("leader");
  globalThis.fetch = undefined as unknown as typeof fetch;
});

test("leader refreshes under the named Web Lock and does not broadcast credentials", async () => {
  let rotated = 0;
  let recovered = 0;

  const result = await coordinateBrowserRefresh({
    rotate: async () => {
      rotated += 1;
      return "rotated";
    },
    recover: async () => {
      recovered += 1;
      return "recovered";
    },
  });

  assert.equal(result, "rotated");
  assert.equal(rotated, 1);
  assert.equal(recovered, 0);
});

test("a waiting tab recovers after the lock without performing a second rotation", async () => {
  installBrowser("busy");
  let rotated = 0;
  let recovered = 0;

  const result = await coordinateBrowserRefresh({
    waitTimeoutMs: 1,
    rotate: async () => {
      rotated += 1;
      return "unsafe";
    },
    recover: async () => {
      recovered += 1;
      return "recovered";
    },
  });

  assert.equal(result, "recovered");
  assert.equal(rotated, 0);
  assert.equal(recovered, 1);
});

test("waiters ignore stale and future generation signals, including duplicates and out-of-order versions", async () => {
  installBrowser("busy", true);
  setAuthenticated({ accessToken: "current-session" });
  const generation = getSnapshot().generation;
  const external = new FakeBroadcastChannel("kora.auth.v1");
  let recovered = 0;

  const resultPromise = coordinateBrowserRefresh({
    waitTimeoutMs: 100,
    rotate: async () => "unsafe",
    recover: async () => {
      recovered += 1;
      return "recovered";
    },
  });

  // The operation belongs to the current generation. Signals from an older
  // logout and a speculative future login must not wake it.
  external.postMessage({
    type: "refresh-start",
    source: "other-tab",
    generation: generation - 1,
    version: 100,
    status: "started",
  });
  external.postMessage({
    type: "refresh-complete",
    source: "other-tab",
    generation: generation + 1,
    version: 101,
    status: "completed",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(recovered, 0);

  // A matching completion wakes exactly once; lower and duplicate versions
  // are ignored after the waiter is removed.
  for (const version of [10, 9, 10]) {
    external.postMessage({
      type: "refresh-complete",
      source: "other-tab",
      generation,
      version,
      status: "completed",
    });
  }

  assert.equal(await resultPromise, "recovered");
  assert.equal(recovered, 1);
  external.close();
});

test("logout and a newer login advance generation and prevent stale recovery commit", async () => {
  installBrowser("busy", true);
  setAuthenticated({ accessToken: "current-session" });
  const external = new FakeBroadcastChannel("kora.auth.v1");
  let recovered = 0;

  const pending = coordinateBrowserRefresh({
    waitTimeoutMs: 10,
    rotate: async () => "unsafe",
    recover: async () => {
      recovered += 1;
      return "must-not-commit";
    },
  });

  clearAuthenticated();
  setAuthenticated({ accessToken: "new-session" });
  external.postMessage({
    type: "refresh-complete",
    source: "other-tab",
    generation: 1,
    version: Date.now(),
    status: "completed",
  });

  await assert.rejects(pending, StaleAuthGenerationError);
  assert.equal(recovered, 0);
  assert.equal(getSnapshot().accessToken, "new-session");
  external.close();
});

test("browsers without Web Locks use recovery only and fail closed on an expired cookie", async () => {
  installBrowser("none");
  let rotated = 0;

  await assert.rejects(
    () =>
      coordinateBrowserRefresh({
        rotate: async () => {
          rotated += 1;
          return "unsafe";
        },
        recover: async () => {
          throw new BrowserAccessTokenRecoveryError(401, "expired");
        },
      }),
    RefreshCoordinationUnavailableError,
  );

  assert.equal(rotated, 0);
});

test("browsers without Web Locks use valid recovery without rotating the refresh cookie", async () => {
  installBrowser("none");
  let rotated = 0;
  let recovered = 0;

  const result = await coordinateBrowserRefresh({
    rotate: async () => {
      rotated += 1;
      return "unsafe";
    },
    recover: async () => {
      recovered += 1;
      return "recovered";
    },
  });

  assert.equal(result, "recovered");
  assert.equal(rotated, 0);
  assert.equal(recovered, 1);
});

test("recovery client sends browser credentials and commits access state only in memory", async () => {
  const requests: Array<{
    headers: Headers;
    credentials?: RequestCredentials;
  }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
    });
    return Response.json({
      data: {
        user: {
          id: "user-1",
          email: "owner@example.com",
          displayName: "Owner",
        },
        accessToken: "memory-access-token",
        accessTokenExpiresInSeconds: 900,
        session: {
          id: "session-1",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      },
    });
  };

  const result = await recoverBrowserAccessToken({
    apiBase: "https://api.koraafric.com",
  });

  assert.equal(result.accessToken, "memory-access-token");
  assert.equal(requests[0]?.credentials, "include");
  assert.equal(requests[0]?.headers.get("X-Kora-Client"), "web");
  assert.equal(getSnapshot().accessToken, "memory-access-token");
  assert.equal(getSnapshot().state, "AUTHENTICATED");
});

test("a recovery response cannot restore auth after logout advances the generation", async () => {
  let resolveResponse: ((response: Response) => void) | undefined;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

  const request = recoverBrowserAccessToken({
    apiBase: "https://api.koraafric.com",
  });
  clearAuthenticated();
  resolveResponse?.(
    Response.json({
      data: {
        user: {
          id: "user-1",
          email: "owner@example.com",
          displayName: "Owner",
        },
        accessToken: "stale-token",
        accessTokenExpiresInSeconds: 900,
        session: {
          id: "session-1",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      },
    }),
  );

  await assert.rejects(request, /session changed/i);
  assert.equal(getSnapshot().accessToken, null);
});

test("recovery response rejects refresh-token fields", async () => {
  setAuthenticated({ accessToken: "existing" });
  globalThis.fetch = async () =>
    Response.json({
      data: {
        accessToken: "access",
        refreshToken: "must-not-be-accepted",
      },
    });

  await assert.rejects(
    () => recoverBrowserAccessToken({ apiBase: "https://api.koraafric.com" }),
    /unsafe browser recovery response/i,
  );
  assert.equal(getSnapshot().accessToken, "existing");
});
