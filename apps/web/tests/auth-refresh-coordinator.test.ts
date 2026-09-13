import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  BrowserAccessTokenRecoveryError,
  RefreshCoordinationUnavailableError,
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

function installBrowser(lockMode: "leader" | "busy" | "none"): void {
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
    value: undefined,
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
