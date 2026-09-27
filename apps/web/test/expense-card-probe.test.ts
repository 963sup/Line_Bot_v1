import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("expense card CLI loads the Web presenter and validates without sending messages", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    process.argv = [process.execPath, 'scripts/probes/check-expense-card.mjs', '--live'];
    let calls = 0;
    globalThis.fetch = async (input, options) => {
      calls++;
      assert.equal(String(input), 'https://api.line.me/v2/bot/message/validate/reply');
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].altText, '🧾 新支出 #5 · 待處理');
      return Response.json({});
    };
    await import('./scripts/probes/check-expense-card.mjs');
    assert.equal(calls, 1);
  `,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "test",
        LINE_CHANNEL_ACCESS_TOKEN: "offline-token",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"validatedCards":1,"messagesSent":0/);
});
