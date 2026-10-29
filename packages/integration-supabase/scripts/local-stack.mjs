import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { createPrivateStorageClient } from "../src/storage-client.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(packageRoot, "../..");
const state = resolve(packageRoot, ".temp");
const config = parse(readFileSync(resolve(packageRoot, "supabase/config.toml"), "utf8"));
const container = `supabase_db_${config.project_id}`;
// Image selected by the pinned CLI; upgrades must update this mapping together.
const postgresImage = { cli: "2.116.0", ref: "ghcr.io/supabase/postgres:17.6.1.165" };
const imageRegistry = (process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY || "ghcr.io").replace(
  /\/$/,
  "",
);
const dockerEnv = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete dockerEnv[key];

function run(command, args, options = {}) {
  if (
    command === "crane" &&
    !process.env.PATH?.split(":").some((entry) => {
      try {
        return existsSync(resolve(entry, command));
      } catch {
        return false;
      }
    })
  ) {
    throw new Error(
      "crane is required for Docker vfs image preparation. Install crane in the Cloud environment and execute provider commands through `pnpm provider:supabase`.",
    );
  }
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    mkdirSync(state, { recursive: true, mode: 0o700 });
    const log = resolve(state, "process-error.log");
    writeFileSync(log, result.stderr ?? result.error?.message ?? "", { mode: 0o600 });
    chmodSync(log, 0o600);
    throw new Error(`${command} failed (exit ${result.status ?? "unknown"}).`, {
      cause: result.error,
    });
  }
  return result.stdout.trim();
}

function docker(args, input) {
  return run("docker", ["--host=unix:///var/run/docker.sock", ...args], { env: dockerEnv, input });
}

export function imageChanges(config, digest) {
  const changes = [];
  const change = (value) => changes.push("--change", value);
  for (const value of config.Env ?? []) change(`ENV ${value}`);
  for (const key of ["Entrypoint", "Cmd"])
    if (config[key]) change(`${key.toUpperCase()} ${JSON.stringify(config[key])}`);
  for (const [key, instruction] of [
    ["User", "USER"],
    ["WorkingDir", "WORKDIR"],
    ["StopSignal", "STOPSIGNAL"],
  ])
    if (config[key]) change(`${instruction} ${config[key]}`);
  for (const port of Object.keys(config.ExposedPorts ?? {})) change(`EXPOSE ${port}`);
  if (config.Volumes) change(`VOLUME ${JSON.stringify(Object.keys(config.Volumes))}`);
  for (const [key, value] of Object.entries(config.Labels ?? {}))
    change(`LABEL ${key}=${JSON.stringify(value)}`);
  change(`LABEL org.opencontainers.image.base.digest=${digest}`);
  return changes;
}

function prepareImage(ref, loopbackProbe) {
  ref = ref.replace("ghcr.io/", `${imageRegistry}/`);
  let previous = docker(["images", "--quiet", "--no-trunc", ref]);
  if (previous) {
    if (!loopbackProbe) return;
    const labels = JSON.parse(
      docker(["image", "inspect", "--format", "{{json .Config.Labels}}", ref]),
    );
    if (labels?.["local.supabase.loopback-wget"] === "1") return;
  }
  if (!previous && loopbackProbe) {
    docker(["pull", ref]);
    previous = docker(["images", "--quiet", "--no-trunc", ref]);
  }
  const cached = previous ? JSON.parse(docker(["image", "inspect", ref]))[0] : undefined;
  const digest = cached
    ? (cached.RepoDigests?.[0]?.split("@")[1] ?? cached.Id)
    : run("crane", ["digest", ref]);
  const source = `${ref.slice(0, ref.lastIndexOf(":"))}@${digest}`;
  const config = cached?.Config ?? JSON.parse(run("crane", ["config", source])).config;
  const archive = resolve(state, "postgres-rootfs.tar");
  console.log(`Preparing ${ref} for the managed Docker environment.`);
  let descriptor;
  let temporary;
  try {
    if (cached) {
      temporary = `supabase-image-${randomUUID()}`;
      docker(["create", "--name", temporary, "--entrypoint", "/bin/true", ref]);
      docker(["export", "--output", archive, temporary]);
      docker(["rm", "--volumes", temporary]);
      temporary = undefined;
    } else run("crane", ["export", source, archive]);
    if (loopbackProbe) {
      const overlay = resolve(state, "image-overlay");
      const target = resolve(overlay, "usr/local/bin/wget");
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(packageRoot, "supabase/loopback-wget.sh"), target);
      chmodSync(target, 0o755);
      run("tar", ["--append", "--file", archive, "--directory", overlay, "usr/local/bin/wget"]);
      config.Labels = { ...config.Labels, "local.supabase.loopback-wget": "1" };
    }
    descriptor = openSync(archive, "r");
    run(
      "docker",
      ["--host=unix:///var/run/docker.sock", "import", ...imageChanges(config, digest), "-", ref],
      { env: dockerEnv, stdio: [descriptor, "pipe", "pipe"] },
    );
    if (previous) {
      // Remove only the exact image replaced above; never force removal of shared images.
      spawnSync("docker", ["--host=unix:///var/run/docker.sock", "image", "rm", previous], {
        env: dockerEnv,
        stdio: "ignore",
      });
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporary)
      spawnSync(
        "docker",
        ["--host=unix:///var/run/docker.sock", "rm", "--force", "--volumes", temporary],
        { env: dockerEnv, stdio: "ignore" },
      );
    rmSync(archive, { force: true });
  }
}

function prepareLocalImages() {
  const vfs = docker(["info", "--format", "{{.Driver}}"]) === "vfs";
  const proxy = process.env.HTTP_PROXY || process.env.http_proxy;
  if (vfs || proxy) {
    const version = JSON.parse(
      readFileSync(resolve(root, "node_modules/supabase/package.json"), "utf8"),
    ).version;
    if (version !== postgresImage.cli)
      throw new Error("Update local image mappings together with the pinned Supabase CLI.");
  }
  if (vfs) prepareImage(postgresImage.ref, false);
  if (process.env.HTTP_PROXY || process.env.http_proxy) {
    prepareImage("ghcr.io/supabase/gotrue:v2.196.0", true);
    prepareImage("ghcr.io/supabase/storage-api:v1.70.3", true);
  }
}

function cli(args) {
  const cliHome = resolve(state, "cli-home");
  mkdirSync(cliHome, { recursive: true, mode: 0o700 });
  const log = resolve(state, "cli.log");
  const descriptor = args[0] === "start" ? openSync(log, "w", 0o600) : undefined;
  const result = spawnSync(
    resolve(root, "node_modules/.bin/supabase"),
    [...args, "--workdir", packageRoot],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      ...(descriptor === undefined ? {} : { stdio: ["ignore", descriptor, descriptor] }),
      env: {
        ...dockerEnv,
        SUPABASE_HOME: cliHome,
        SUPABASE_INTERNAL_IMAGE_REGISTRY: process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY || "ghcr.io",
      },
    },
  );
  if (descriptor !== undefined) closeSync(descriptor);
  else writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, { mode: 0o600 });
  chmodSync(log, 0o600);
  if (result.error || result.status !== 0)
    throw new Error(
      `Supabase ${args[0]} failed (exit ${result.status ?? "unknown"}, signal ${result.signal ?? "none"}); inspect ${log} locally (may contain credentials).`,
      { cause: result.error },
    );
  return result.stdout ?? "";
}

export function startArguments(full) {
  return full
    ? ["start"]
    : [
        "start",
        "--exclude",
        "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
      ];
}

export function localEnvironment(status) {
  for (const name of ["API_URL", "DB_URL", "SERVICE_ROLE_KEY", "ANON_KEY"]) {
    if (typeof status[name] !== "string" || !status[name] || /[\r\n]/.test(status[name]))
      throw new Error(`Missing or invalid local ${name}.`);
  }
  for (const name of ["API_URL", "DB_URL"]) {
    const url = new URL(status[name]);
    const protocols = name === "API_URL" ? ["http:", "https:"] : ["postgres:", "postgresql:"];
    if (
      !protocols.includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("Only loopback Supabase endpoints are allowed.");
  }
  return {
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    POSTGRES_URL: status.DB_URL,
    POSTGRES_URL_NON_POOLING: status.DB_URL,
    CAPABILITY_TEST_DATABASE_URL: status.DB_URL,
  };
}

function sql(query) {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    query,
  );
}

function initializeSchema() {
  const directory = resolve(packageRoot, "src/schemas");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const schema = files.map((name) => readFileSync(resolve(directory, name), "utf8")).join("\n");
  const digest = createHash("sha256").update(schema).digest("hex");
  const stamp = resolve(state, "schema.sha256");
  const present = sql("select to_regnamespace('app_private') is not null;") === "t";
  if (present) {
    if (!existsSync(stamp) || readFileSync(stamp, "utf8").trim() !== digest)
      throw new Error(
        "Local schema differs from its current source checkpoint; reconcile explicitly. Existing data was preserved.",
      );
  } else {
    sql(`BEGIN;\n${schema}\nCOMMIT;`);
    writeFileSync(stamp, `${digest}\n`);
  }
  return files.length;
}

async function verifyStorage(env) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Local Storage health failed (${response.status}).`);
  const buckets = await response.json();
  for (const [name, desired] of Object.entries(config.storage.buckets)) {
    if (!buckets.some((bucket) => bucket.id === name && bucket.public === desired.public))
      throw new Error(`Local Storage bucket ${name} is missing or has incorrect visibility.`);
  }
}

async function storageReadback(env) {
  const client = createPrivateStorageClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const bucket = client.storage.from("repository-files");
  const key = `.bootstrap/${randomUUID()}`;
  const bytes = new TextEncoder().encode("local-supabase-storage-readback");
  try {
    const uploaded = await bucket.upload(key, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (uploaded.error)
      throw new Error("Local Storage upload smoke failed.", { cause: uploaded.error });
    const downloaded = await bucket.download(key);
    if (downloaded.error || !downloaded.data)
      throw new Error("Local Storage readback smoke failed.", { cause: downloaded.error });
    const actual = new Uint8Array(await downloaded.data.arrayBuffer());
    if (
      createHash("sha256").update(actual).digest("hex") !==
      createHash("sha256").update(bytes).digest("hex")
    )
      throw new Error("Local Storage readback digest mismatch.");
  } finally {
    const removed = await bucket.remove([key]);
    if (removed.error)
      throw new Error("Local Storage smoke cleanup failed.", { cause: removed.error });
  }
  const absent = await bucket.download(key);
  if (
    !absent.error ||
    (String(absent.error.status) !== "404" && String(absent.error.statusCode) !== "404")
  )
    throw new Error("Local Storage smoke removal could not be verified.");
  console.log("Local Storage upload, digest readback and removal verified.");
}

export async function main(args = process.argv.slice(2)) {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const [command = "status", option] = args;
  if (args.length > 2 || (option && !(command === "start" && option === "--full")))
    throw new Error("Usage: local-stack.mjs start [--full] | status | verify | stop | version");
  if (command === "version") {
    console.log(cli(["--version"]).trim());
    return;
  }
  docker(["info", "--format", "{{.ServerVersion}}"]);
  if (command === "stop") {
    cli(["stop"]);
    console.log("Local Supabase stopped; volumes retained.");
    return;
  }
  if (!["start", "status", "verify"].includes(command))
    throw new Error("Unknown local stack command.");
  if (command === "start") {
    const disk = statfsSync(root);
    const existing = docker([
      "ps",
      "-a",
      "--filter",
      `name=^/${container}$`,
      "--format",
      "{{.Names}}",
    ]);
    const requiredGiB = option === "--full" ? 20 : existing ? 1 : 8;
    if (disk.bavail * disk.bsize < requiredGiB * 1024 ** 3)
      throw new Error(
        `At least ${requiredGiB} GiB free disk is required before preparing this local Supabase stack.`,
      );
    console.log(
      `Starting Supabase ${option === "--full" ? "full" : "File development"} stack; CLI logs remain private.`,
    );
    prepareLocalImages();
    cli(startArguments(option === "--full"));
  }
  const env = localEnvironment(JSON.parse(cli(["status", "--output", "json"])));
  if (command === "start") {
    const count = initializeSchema();
    const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(
      resolve(state, "local.env"),
      Object.entries(env)
        .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    chmodSync(resolve(state, "local.env"), 0o600);
    console.log(`Current application schema ready (${count} files); no migration history created.`);
  }
  if (command !== "status") {
    if (sql("select to_regclass('app_private.repository_files') is not null;") !== "t")
      throw new Error("Local File schema is not initialized.");
    await verifyStorage(env);
    if (command === "start") await storageReadback(env);
  }
  console.log(
    JSON.stringify({
      scope: "local-supabase",
      command,
      api: env.SUPABASE_URL,
      database: new URL(env.POSTGRES_URL).host,
      environmentFile: resolve(state, "local.env"),
      credentials: "redacted",
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
