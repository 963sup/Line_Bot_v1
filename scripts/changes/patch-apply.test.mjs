import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { applyPreparedPatch, preparePatch, runPatch } from "./patch-apply.mjs";

function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

function fixture(run) {
  const artifacts = join(process.cwd(), ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(join(artifacts, "patch-apply-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function plan(path, before, after, source = before) {
  return {
    version: 1,
    objective: "fixture",
    changes: [{ path, sha256: digest(source), before, after }],
  };
}

test("dry run previews a single exact replacement and apply writes it", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "before");
    const input = plan("note.txt", "before", "after");
    const preview = runPatch(input, { root });
    assert.deepEqual(preview.changes, [
      { path: "note.txt", status: "ready", preview: { before: "before", after: "after" } },
    ]);
    assert.equal(readFileSync(join(root, "note.txt"), "utf8"), "before");
    runPatch(input, { root, apply: true });
    assert.equal(readFileSync(join(root, "note.txt"), "utf8"), "after");
  }));

test("rejects stale hashes and ambiguous replacement text", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "same same");
    assert.throws(
      () => preparePatch(plan("note.txt", "same", "other", "old"), { root }),
      /SHA-256 mismatch/,
    );
    assert.throws(
      () => preparePatch(plan("note.txt", "same", "other", "same same"), { root }),
      /exactly once/,
    );
    writeFileSync(join(root, "note.txt"), "aaa");
    assert.throws(
      () => preparePatch(plan("note.txt", "aa", "other", "aaa"), { root }),
      /exactly once/,
    );
  }));

test("keeps replacement dollar signs literal and rejects protected aliases", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "before");
    const literal = plan("note.txt", "before", "$& $$ $` $'", "before");
    runPatch(literal, { root, apply: true });
    assert.equal(readFileSync(join(root, "note.txt"), "utf8"), "$& $$ $` $'");
    writeFileSync(join(root, "note.txt"), "before");
    for (const path of [".GIT/config", "NODE_MODULES/file.txt", "note.txt:stream"]) {
      assert.throws(
        () => preparePatch(plan(path, "before", "after"), { root }),
        /Protected|Invalid/,
      );
    }
    const duplicate = {
      version: 1,
      objective: "case aliases",
      changes: [
        { path: "note.txt", sha256: digest("before"), before: "before", after: "after" },
        { path: "NOTE.TXT", sha256: digest("before"), before: "before", after: "after" },
      ],
    };
    assert.throws(() => preparePatch(duplicate, { root }), /only once/);
  }));

test("rejects Windows trailing-dot and trailing-space aliases before any write", () =>
  fixture((root) => {
    for (const path of ["note.txt", ".env", ".env.local"]) {
      writeFileSync(join(root, path), "synthetic");
    }
    for (const path of [
      "note.txt.",
      "note.txt ",
      ".env ",
      ".env.",
      ".env.local.",
      ".git /config",
    ]) {
      const input = plan("note.txt", "synthetic", "first");
      input.changes.push(...plan(path, "synthetic", "second").changes);
      assert.throws(() => runPatch(input, { root, apply: true }), /Invalid workspace path/);
      for (const original of ["note.txt", ".env", ".env.local"]) {
        assert.equal(readFileSync(join(root, original), "utf8"), "synthetic");
      }
    }
  }));

test("rejects path escapes and symlink traversal", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "before");
    assert.throws(
      () => preparePatch(plan("../note.txt", "before", "after"), { root }),
      /Invalid workspace path/,
    );
    const outside = mkdtempSync(join(process.cwd(), ".artifacts", "patch-apply-outside-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "before");
      symlinkSync(outside, join(root, "linked"), "junction");
      assert.throws(
        () => preparePatch(plan("linked/secret.txt", "before", "after"), { root }),
        /Symlink traversal/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }));

test("a later invalid change prevents every write", () =>
  fixture((root) => {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "first.txt"), "one");
    writeFileSync(join(root, "nested", "second.txt"), "two two");
    const input = {
      version: 1,
      objective: "atomic preflight",
      changes: [
        { path: "first.txt", sha256: digest("one"), before: "one", after: "ONE" },
        { path: "nested/second.txt", sha256: digest("two two"), before: "two", after: "TWO" },
      ],
    };
    assert.throws(() => runPatch(input, { root, apply: true }), /exactly once/);
    assert.equal(readFileSync(join(root, "first.txt"), "utf8"), "one");
  }));

test("rechecks all original bytes before writing", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "before");
    const prepared = preparePatch(plan("note.txt", "before", "after"), { root });
    writeFileSync(join(root, "note.txt"), "changed");
    assert.throws(() => applyPreparedPatch(prepared), /changed after preflight/);
    assert.equal(readFileSync(join(root, "note.txt"), "utf8"), "changed");
  }));

test("rechecks symlink traversal immediately before writes", () =>
  fixture((root) => {
    writeFileSync(join(root, "note.txt"), "before");
    const prepared = preparePatch(plan("note.txt", "before", "after"), { root });
    const outside = mkdtempSync(join(process.cwd(), ".artifacts", "patch-apply-outside-"));
    try {
      writeFileSync(join(outside, "target.txt"), "before");
      rmSync(join(root, "note.txt"));
      symlinkSync(join(outside, "target.txt"), join(root, "note.txt"), "file");
      assert.throws(() => applyPreparedPatch(prepared), /Symlink traversal/);
      assert.equal(readFileSync(join(outside, "target.txt"), "utf8"), "before");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }));
