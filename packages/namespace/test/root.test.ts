import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { isReservedRootNamespaceKey, ROOT_NAMESPACE_RESERVED_KEYS } from "../src/domain/root.js";

const appRoot = new URL("../../../apps/web/src/app/", import.meta.url);

function staticRootSegments(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith("[")) return [];
    if (/^\(.+\)$/.test(entry.name))
      return staticRootSegments(new URL(`${entry.name}/`, directory));
    return [entry.name];
  });
}

function sqlReservedKeys(path: string, pattern: RegExp): string[] {
  const sql = readFileSync(
    new URL(`../../../packages/integration-supabase/src/schemas/${path}`, import.meta.url),
    "utf8",
  );
  const body = pattern.exec(sql)?.[1];
  assert.ok(body, "Namespace SQL must expose the reserved-key enforcement list");
  return [...body.matchAll(/'([^']+)'/g)].map((match) => {
    const key = match[1];
    assert.ok(key);
    return key;
  });
}

test("root namespace reservation keys are canonical and unique", () => {
  assert.equal(new Set(ROOT_NAMESPACE_RESERVED_KEYS).size, ROOT_NAMESPACE_RESERVED_KEYS.length);
  assert.deepEqual([...ROOT_NAMESPACE_RESERVED_KEYS].sort(), [...ROOT_NAMESPACE_RESERVED_KEYS]);
  for (const key of ROOT_NAMESPACE_RESERVED_KEYS) {
    assert.equal(key, key.trim().toLowerCase());
    assert.match(key, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
    assert.equal(isReservedRootNamespaceKey(key), true);
  }
  assert.equal(isReservedRootNamespaceKey("alice"), false);
});

test("global account surfaces are reserved without over-reserving nested resource segments", () => {
  for (const key of ["issues", "pulls", "sponsors", "stars"]) {
    assert.equal(isReservedRootNamespaceKey(key), true, `${key} must remain a global root route`);
  }

  for (const key of ["pull", "teams", "people", "packages", "discussions"]) {
    assert.equal(
      isReservedRootNamespaceKey(key),
      false,
      `${key} is scoped below an account, repository, or organization route`,
    );
  }
});

test("every current static root route is reserved before Account may claim it", () => {
  const staticRoots = new Set(staticRootSegments(appRoot));
  for (const key of ["api", "home", "settings", "issues", "stars"])
    assert.ok(staticRoots.has(key), `${key} must remain visible through nested route groups`);

  const missing = [...staticRoots].filter((key) => !isReservedRootNamespaceKey(key)).sort();
  assert.deepEqual(missing, []);
});

test("database global-login enforcement mirrors Namespace source of truth", () => {
  const expected = [...ROOT_NAMESPACE_RESERVED_KEYS];
  assert.deepEqual(
    sqlReservedKeys("101_account_logins.sql", /login not in \(([^)]+)\)/s),
    expected,
  );
  assert.deepEqual(
    sqlReservedKeys("101_account_logins.sql", /normalized in \(([^)]+)\)/s),
    expected,
  );
  assert.deepEqual(
    sqlReservedKeys("103_namespace_bindings.sql", /v_lower in \(([^)]+)\)/s),
    expected,
  );
});
