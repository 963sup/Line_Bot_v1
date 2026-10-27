import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { imageChanges, localEnvironment, startArguments } from "../scripts/local-stack.mjs";

test("cold status provides its own writable CLI home without bootstrap or a user home", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "supabase-status-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const owner = join(fixture, "packages/integration-supabase");
  for (const path of ["scripts", "src", "supabase"])
    mkdirSync(join(owner, path), { recursive: true });
  for (const path of ["scripts/local-stack.mjs", "src/storage-client.ts", "supabase/config.toml"])
    copyFileSync(join(source, path), join(owner, path));
  mkdirSync(join(fixture, "node_modules/.bin"), { recursive: true });
  mkdirSync(join(fixture, "node_modules/@supabase"), { recursive: true });
  symlinkSync(resolve(source, "node_modules/smol-toml"), join(fixture, "node_modules/smol-toml"));
  symlinkSync(
    resolve(source, "node_modules/@supabase/supabase-js"),
    join(fixture, "node_modules/@supabase/supabase-js"),
  );
  const cli = join(fixture, "node_modules/.bin/supabase");
  writeFileSync(
    cli,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const owner = process.argv[process.argv.indexOf('--workdir') + 1];
const expected = path.join(owner, '.temp/cli-home');
assert.equal(process.env.SUPABASE_HOME, expected);
assert.deepEqual(process.argv.slice(2, 5), ['status', '--output', 'json']);
assert.equal(process.env.SUPABASE_ACCESS_TOKEN, 'fixture-token');
assert.equal(process.env.DOCKER_CONFIG, '/fixture/docker-config');
fs.writeFileSync(path.join(expected, 'state.json'), JSON.stringify({home:process.env.HOME}));
console.log(JSON.stringify({API_URL:'http://127.0.0.1:54321',DB_URL:'postgresql://postgres@127.0.0.1:54322/postgres',SERVICE_ROLE_KEY:'fixture-key',ANON_KEY:'fixture-anon'}));
`,
  );
  chmodSync(cli, 0o755);
  const bin = join(fixture, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "docker"), "#!/bin/sh\nprintf '28.4.0\\n'\n");
  chmodSync(join(bin, "docker"), 0o755);
  const absentHome = join(fixture, "missing-user-home");
  const result = spawnSync(process.execPath, [join(owner, "scripts/local-stack.mjs"), "status"], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: absentHome,
      SUPABASE_HOME: "/proc/unwritable-supabase-home",
      SUPABASE_ACCESS_TOKEN: "fixture-token",
      DOCKER_CONFIG: "/fixture/docker-config",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).credentials, "redacted");
  assert.deepEqual(JSON.parse(readFileSync(join(owner, ".temp/cli-home/state.json"), "utf8")), {
    home: absentHome,
  });
  assert.equal(existsSync(absentHome), false);
});

test("local environment uses stack credentials rather than inherited hosted credentials", () => {
  const env = localEnvironment({
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:local@127.0.0.1:54322/postgres",
    SERVICE_ROLE_KEY: "local-only-key",
    ANON_KEY: "local-anon",
  });
  assert.equal(env.SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "local-only-key");
  assert.equal(env.POSTGRES_URL, env.CAPABILITY_TEST_DATABASE_URL);
});

test("stack setup refuses remote database or missing local credentials", () => {
  const status = {
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:local@127.0.0.1:54322/postgres",
    SERVICE_ROLE_KEY: "local-key",
    ANON_KEY: "local-anon",
  };
  assert.throws(() => localEnvironment({ ...status, DB_URL: "postgresql://db.example/postgres" }));
  assert.throws(() => localEnvironment({ ...status, API_URL: "https://api.example" }));
  assert.throws(() => localEnvironment({ ...status, SERVICE_ROLE_KEY: "" }));
});

test("default stack starts required File services without optional heavyweight services", () => {
  const args = startArguments(false);
  assert.equal(args[0], "start");
  assert.ok(!args.includes("--ignore-health-check"));
  const excluded = args[args.indexOf("--exclude") + 1].split(",");
  assert.ok(excluded.includes("studio"));
  assert.ok(excluded.includes("logflare"));
  assert.ok(!excluded.includes("storage-api"));
  assert.ok(!excluded.includes("gotrue"));
  assert.deepEqual(startArguments(true), ["start"]);
});

test("flattening keeps the database startup configuration and source provenance", () => {
  const changes = imageChanges(
    {
      Entrypoint: ["docker-entrypoint.sh"],
      Cmd: ["postgres", "-D", "/etc/postgresql"],
      Env: ["PGDATA=/var/lib/postgresql/data"],
      User: "postgres",
      WorkingDir: "/",
      StopSignal: "SIGINT",
      ExposedPorts: { "5432/tcp": {} },
      Volumes: { "/var/lib/postgresql/data": {} },
    },
    "sha256:source",
  );
  for (const value of [
    'ENTRYPOINT ["docker-entrypoint.sh"]',
    'CMD ["postgres","-D","/etc/postgresql"]',
    "ENV PGDATA=/var/lib/postgresql/data",
    "USER postgres",
    "WORKDIR /",
    "STOPSIGNAL SIGINT",
    "EXPOSE 5432/tcp",
    'VOLUME ["/var/lib/postgresql/data"]',
    "LABEL org.opencontainers.image.base.digest=sha256:source",
  ])
    assert.ok(changes.includes(value), value);
});
