import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { isReservedRootNamespaceKey, ROOT_NAMESPACE_RESERVED_KEYS } from "../src/root.js";

const appRoot = new URL("../../../apps/web/src/app/", import.meta.url);
const routeGroups = ["(admin)", "(mobile)", "(onboarding)", "(public)", "(resource)", "(system)"];

function sqlReservedKeys(pattern: RegExp): string[] {
  const sql = readFileSync(
    new URL("../../../supabase/schemas/101_account_logins.sql", import.meta.url),
    "utf8",
  );
  const body = pattern.exec(sql)?.[1];
  assert.ok(body, "account login SQL must expose the reserved-key enforcement list");
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
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

test("every current static root route is reserved before Account may claim it", () => {
  const staticRoots = new Set(["api"]);
  for (const group of routeGroups) {
    for (const entry of readdirSync(new URL(`${group}/`, appRoot), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith("[")) continue;
      staticRoots.add(entry.name);
    }
  }

  const missing = [...staticRoots].filter((key) => !isReservedRootNamespaceKey(key)).sort();
  assert.deepEqual(missing, []);
});

test("database Account-login enforcement mirrors Namespace source of truth", () => {
  const expected = [...ROOT_NAMESPACE_RESERVED_KEYS];
  assert.deepEqual(sqlReservedKeys(/login not in \(([^)]+)\)/s), expected);
  assert.deepEqual(sqlReservedKeys(/normalized in \(([^)]+)\)/s), expected);
});
