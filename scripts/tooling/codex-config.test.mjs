import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";

const directory = fileURLToPath(new URL("../../.codex/", import.meta.url));
const config = parse(readFileSync(resolve(directory, "config.toml"), "utf8"));

test("MCP and app approval modes use the host-supported enum", () => {
  const modes = ["auto", "prompt", "writes", "approve"];
  for (const item of [...Object.values(config.mcp_servers), ...Object.values(config.apps ?? {})]) {
    if (item.default_tools_approval_mode !== undefined)
      assert.ok(
        modes.includes(item.default_tools_approval_mode),
        `Invalid tool approval mode: ${item.default_tools_approval_mode}`,
      );
  }
});

test("project guidance budget fits every tracked AGENTS instruction chain", () => {
  const root = resolve(directory, "..");
  const defaultBudget = 32768;
  assert.ok(
    config.project_doc_max_bytes <= defaultBudget,
    "Do not hide guidance growth by raising the host budget",
  );
  assert.ok(
    readFileSync(resolve(root, "AGENTS.md")).length <= 15360,
    "Root guidance must leave room for nested instructions",
  );
  const paths = execFileSync("git", ["ls-files", "--", "AGENTS.md", "**/AGENTS.md"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((path) => !path.startsWith(".agents/skills/"));
  for (const path of paths) {
    const parts = path.split("/");
    let bytes = 0;
    for (let depth = 0; depth < parts.length; depth++) {
      const ancestor = [...parts.slice(0, depth), "AGENTS.md"].join("/");
      if (paths.includes(ancestor)) bytes += readFileSync(resolve(root, ancestor)).length + 2;
    }
    assert.ok(
      bytes <= Math.min(defaultBudget, config.project_doc_max_bytes),
      `${path}: ${bytes} bytes exceeds budget`,
    );
  }
});

test("global Codex settings stay at root rather than leaking into MCP server tables", () => {
  for (const key of ["tool_output_token_limit", "project_doc_max_bytes"]) {
    assert.ok(
      Number.isInteger(config[key]) && config[key] > 0,
      `${key} must be a positive root budget`,
    );
  }
  assert.ok(["disabled", "cached", "indexed", "live"].includes(config.web_search));
  for (const [name, server] of Object.entries(config.mcp_servers)) {
    for (const key of [
      "tool_output_token_limit",
      "project_doc_max_bytes",
      "web_search",
      "features",
      "agents",
      "max_depth",
      "max_concurrent_threads_per_session",
    ]) {
      assert.equal(Object.hasOwn(server, key), false, `${name}: misplaced ${key}`);
    }
  }
});

test("registered agent configurations resolve locally with matching roles and instructions", () => {
  let count = 0;
  for (const [name, role] of Object.entries(config.agents)) {
    if (typeof role !== "object" || !role.config_file) continue;
    const path = resolve(directory, role.config_file);
    const location = relative(resolve(directory, "agents"), path);
    assert.ok(
      location && !isAbsolute(location) && location !== ".." && !location.startsWith("../"),
    );
    const agent = parse(readFileSync(path, "utf8"));
    assert.equal(agent.name, name);
    assert.ok(agent.developer_instructions.trim().length > 0);
    count++;
  }
  assert.ok(count > 0);
});

test("project hooks have one source and all command handlers exist", () => {
  assert.equal(config.hooks, undefined, "Do not duplicate hooks.json in inline configuration");
  const hooks = JSON.parse(readFileSync(resolve(directory, "hooks.json"), "utf8"));
  assert.equal(config.features.hooks, true);
  assert.ok(
    hooks.hooks.UserPromptSubmit.some((group) =>
      group.hooks.some((handler) => handler.command.includes("/requirement-preflight.mjs")),
    ),
  );
  for (const groups of Object.values(hooks.hooks)) {
    for (const group of groups) {
      if (group.matcher) assert.doesNotThrow(() => new RegExp(group.matcher));
      for (const handler of group.hooks) {
        const match = handler.command.match(/\/\.codex\/hooks\/([^"/]+\.mjs)"$/);
        assert.ok(match, "Use a git-root-based handler path");
        assert.ok(readFileSync(resolve(directory, "hooks", match[1]), "utf8").length > 0);
        assert.ok(handler.timeout > 0 && handler.timeout <= 60);
      }
    }
  }
});
