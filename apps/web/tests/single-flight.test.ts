import assert from "node:assert/strict";
import { test } from "node:test";
import { createSingleFlightGuard } from "../src/lib/utils/single-flight.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("a second call started while the first is still running is dropped", async () => {
  const guard = createSingleFlightGuard();
  const first = deferred<string>();
  let secondActionCalls = 0;

  const firstRun = guard.run(() => first.promise);
  assert.equal(guard.isInFlight, true);

  const secondRun = guard.run(async () => {
    secondActionCalls += 1;
    return "second";
  });

  assert.equal(await secondRun, undefined);
  assert.equal(secondActionCalls, 0);

  first.resolve("first");
  assert.equal(await firstRun, "first");
  assert.equal(guard.isInFlight, false);
});

test("a call after the first has settled runs normally", async () => {
  const guard = createSingleFlightGuard();

  assert.equal(
    await guard.run(async () => "one"),
    "one",
  );
  assert.equal(guard.isInFlight, false);
  assert.equal(
    await guard.run(async () => "two"),
    "two",
  );
});

test("the guard clears even when the action throws", async () => {
  const guard = createSingleFlightGuard();

  await assert.rejects(
    guard.run(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );

  assert.equal(guard.isInFlight, false);
  assert.equal(
    await guard.run(async () => "recovered"),
    "recovered",
  );
});
