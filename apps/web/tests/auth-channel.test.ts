import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  broadcastAuthSignal,
  broadcastAuthInvalidation,
  resetAuthChannelForTests,
  startAuthChannel,
} from "../src/lib/auth/channel.ts";

type Listener = (event: { data: unknown }) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: "message", listener: Listener): void {
    this.listeners.add(listener);
  }

  postMessage(data: unknown): void {
    for (const instance of FakeBroadcastChannel.instances) {
      if (instance === this || instance.name !== this.name) continue;
      for (const listener of instance.listeners) listener({ data });
    }
  }

  close(): void {
    this.listeners.clear();
  }
}

let storage = new Map<string, string>();
let storageListeners = new Set<(event: StorageEvent) => void>();

function installWindow(): void {
  storage = new Map();
  storageListeners = new Set();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: undefined,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      addEventListener: (
        _type: "storage",
        listener: (event: StorageEvent) => void,
      ) => storageListeners.add(listener),
      removeEventListener: (
        _type: "storage",
        listener: (event: StorageEvent) => void,
      ) => storageListeners.delete(listener),
    },
  });
}

beforeEach(() => {
  resetAuthChannelForTests();
  FakeBroadcastChannel.instances = [];
  installWindow();
});

test("BroadcastChannel carries invalidation metadata but no credentials", () => {
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel,
  });

  const messages: unknown[] = [];
  startAuthChannel((message) => messages.push(message));

  const external = new FakeBroadcastChannel("kora.auth.v1");
  external.postMessage({
    type: "session-invalidated",
    source: "another-tab",
    accessToken: "must-not-be-consumed",
  });

  assert.deepEqual(messages, [
    { type: "session-invalidated", source: "another-tab" },
  ]);

  broadcastAuthInvalidation("logout");
  assert.equal(storage.size, 0);
});

test("storage fallback emits only invalidation signals", () => {
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: undefined,
  });

  const messages: unknown[] = [];
  startAuthChannel((message) => messages.push(message));
  broadcastAuthInvalidation("auth-generation-changed");

  const raw = storage.get("kora.auth.signal");
  assert.ok(raw);
  const signal = JSON.parse(raw);
  assert.equal(signal.type, "auth-generation-changed");
  assert.equal(typeof signal.source, "string");
  assert.equal("accessToken" in signal, false);
  assert.equal("refreshToken" in signal, false);

  for (const listener of storageListeners) {
    listener({
      key: "kora.auth.signal",
      newValue: raw,
    } as StorageEvent);
  }
  assert.deepEqual(messages, []);

  for (const listener of storageListeners) {
    listener({
      key: "kora.auth.signal",
      newValue: JSON.stringify({
        type: "logout",
        source: "another-tab",
      }),
    } as StorageEvent);
  }
  assert.deepEqual(messages, [{ type: "logout", source: "another-tab" }]);
});

test("refresh lifecycle signals carry only safe coordination metadata", () => {
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel,
  });

  const messages: unknown[] = [];
  startAuthChannel((message) => messages.push(message));

  const external = new FakeBroadcastChannel("kora.auth.v1");
  external.postMessage({
    type: "refresh-complete",
    source: "another-tab",
    generation: 4,
    version: 12,
    status: "completed",
    accessToken: "must-not-be-consumed",
    refreshToken: "must-not-be-consumed",
  });

  assert.deepEqual(messages, [
    {
      type: "refresh-complete",
      source: "another-tab",
      generation: 4,
      version: 12,
      status: "completed",
    },
  ]);

  broadcastAuthSignal("refresh-start", {
    generation: 4,
    version: 13,
    status: "started",
  });
  assert.equal(storage.size, 0);
});
