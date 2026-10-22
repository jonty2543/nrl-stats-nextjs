import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's type-stripping test runner requires the source extension.
import { selectBettingMatchContext } from "./page-context.ts";

test("keeps visible matches and legacy keys without changing values", () => {
  const current = { players: ["Player"] };
  const context = {
    "2026-10-23|tonga|lebanon": current,
    "2026-05-16|eels|storm": { players: ["Historical player"] },
    "tonga|lebanon": current,
  };
  assert.deepEqual(selectBettingMatchContext(context, new Set(["2026-10-23"])), {
    "2026-10-23|tonga|lebanon": current,
    "tonga|lebanon": current,
  });
  assert.equal(Object.keys(context).length, 3);
});

test("empty dates omit dated data but retain legacy lookups", () => {
  assert.deepEqual(selectBettingMatchContext({ "2026-10-23|match": 1, match: 2 }, new Set()), { match: 2 });
});
