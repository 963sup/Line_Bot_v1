import assert from "node:assert/strict";
import { test } from "node:test";
import { imageChanges, localEnvironment, startArguments } from "../scripts/local-stack.mjs";

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
