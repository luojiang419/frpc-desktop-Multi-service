import assert from "node:assert/strict";
import test from "node:test";
import NetUtils from "./NetUtils.ts";

test("treats every bind error as an unavailable port", async () => {
  const unavailable = await NetUtils.checkPortInUse(54321, "192.0.2.1");

  assert.equal(unavailable, true);
});
