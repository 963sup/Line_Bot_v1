import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExactSha, requireCurrentMain } from "./current-main.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("current-main requires an exact SHA", () => {
  assert.equal(parseExactSha(["--sha", SHA]), SHA);
  assert.throws(() => parseExactSha(["--sha", "main"]), /40-hex-sha/);
});

test("current-main accepts only repository main", async () => {
  const result = await requireCurrentMain({
    sha: SHA,
    repository: "963sup/Line_Bot_v1",
    token: "token",
    fetchImpl: async () => json({ commit: { sha: SHA } }),
  });
  assert.equal(result.sha, SHA);

  await assert.rejects(
    requireCurrentMain({
      sha: SHA,
      repository: "963sup/Line_Bot_v1",
      token: "token",
      fetchImpl: async () => json({ commit: { sha: "f".repeat(40) } }),
    }),
    /not current main/,
  );
});
