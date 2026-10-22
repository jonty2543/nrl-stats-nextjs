import assert from "node:assert/strict";
import { after, test } from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the source extension.
import { cacheDevelopmentQuery } from "./development-query-cache.ts";

const environment: Record<string, string | undefined> = process.env;
const previousEnvironment = environment.NODE_ENV;
environment.NODE_ENV = "development";
after(() => {
  if (previousEnvironment === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = previousEnvironment;
});

test("shares concurrent loads and reuses the result", async () => {
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([
    cacheDevelopmentQuery("shared", load),
    cacheDevelopmentQuery("shared", load),
  ]), [1, 1]);
  assert.equal(await cacheDevelopmentQuery("shared", load), 1);
  assert.equal(calls, 1);
});

test("refreshes expired data", async (context) => {
  let now = 1_000;
  context.mock.method(Date, "now", () => now);
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cacheDevelopmentQuery("expiry", load, 100), 1);
  now += 101;
  assert.equal(await cacheDevelopmentQuery("expiry", load, 100), 2);
});

test("does not cache failures", async () => {
  await assert.rejects(cacheDevelopmentQuery("retry", async () => { throw new Error("offline"); }));
  assert.equal(await cacheDevelopmentQuery("retry", async () => "recovered"), "recovered");
});

test("keeps different datasets separate and bounds retained entries", async () => {
  for (let index = 0; index < 33; index++) {
    assert.equal(await cacheDevelopmentQuery(`bounded:${index}`, async () => index), index);
  }
  assert.equal(await cacheDevelopmentQuery("bounded:0", async () => "reloaded"), "reloaded");
});

test("leaves production caching to the existing loaders", async () => {
  environment.NODE_ENV = "production";
  try {
    let calls = 0;
    const load = async () => ++calls;
    assert.equal(await cacheDevelopmentQuery("production", load), 1);
    assert.equal(await cacheDevelopmentQuery("production", load), 2);
  } finally {
    environment.NODE_ENV = "development";
  }
});
