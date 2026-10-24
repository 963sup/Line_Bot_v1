import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { requireCurrentMain } from "../github/current-main.mjs";
import { withPostgres } from "./postgres.mjs";
import { assertValidatedMainMutationContext } from "./remote-authorization.mjs";
import { assertConfirmedProject, assertRemoteTarget } from "./remote-target.mjs";

const root = new URL("../../", import.meta.url);
const bucketConfig = new URL("supabase/config.toml", root);
const linkedProjectFile = new URL("supabase/.temp/project-ref", root);
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const freeMaxObjectBytes = 50_000_000;

function sizeInBytes(value) {
  if (typeof value !== "string") throw new Error("Storage file size must be explicit.");
  const match = /^([1-9][0-9]*)(MB|MiB)$/.exec(value);
  if (!match) throw new Error("Storage file size must use MB or MiB.");
  const size = Number(match[1]) * (match[2] === "MiB" ? 1024 * 1024 : 1_000_000);
  if (!Number.isSafeInteger(size) || size > freeMaxObjectBytes)
    throw new Error("Storage object limit must fit the Free project maximum.");
  return size;
}

/** Native Supabase config.toml is the only Bucket desired-state source. */
export function desiredFileBucket(configText = readFileSync(bucketConfig, "utf8")) {
  const configuration = parse(configText);
  if (configuration.storage?.enabled !== true)
    throw new Error("Supabase Storage must be explicitly enabled.");
  if (sizeInBytes(configuration.storage.file_size_limit) > freeMaxObjectBytes)
    throw new Error("Supabase Storage exceeds the Free global limit.");
  const buckets = configuration.storage.buckets;
  if (!buckets || Object.keys(buckets).length !== 1 || !buckets["repository-files"])
    throw new Error("Exactly one File-owned Bucket must be declared.");
  const file = buckets["repository-files"];
  if (
    file.public !== false ||
    file.allowed_mime_types !== undefined ||
    file.objects_path !== undefined
  )
    throw new Error("File Bucket must be private, format-neutral and fixture-free.");
  const size = sizeInBytes(file.file_size_limit);
  if (size > sizeInBytes(configuration.storage.file_size_limit))
    throw new Error("File Bucket exceeds the configured global limit.");
  return { id: "repository-files", size, public: false };
}

export function bucketState(bucket, row) {
  if (!row) return "missing";
  if (
    row.id !== bucket.id ||
    row.name !== bucket.id ||
    row.public !== false ||
    Number(row.file_size_limit) !== bucket.size ||
    (row.allowed_mime_types !== null &&
      !(Array.isArray(row.allowed_mime_types) && row.allowed_mime_types.length === 0))
  )
    return "conflict";
  return "converged";
}

/** No mutation until current-main authorization, exact target and preflight agree. */
export async function reconcileBucket({ desired, read, link, seed, currentMain }) {
  const before = bucketState(desired, await read());
  if (before === "conflict")
    throw new Error("Existing File Bucket configuration differs from source; review required.");
  if (before === "converged") return { changed: false, status: "converged" };

  await link();
  const afterLink = bucketState(desired, await read());
  if (afterLink === "conflict")
    throw new Error("File Bucket changed during linking; refusing overwrite.");
  if (afterLink === "converged") return { changed: false, status: "converged" };

  await currentMain();
  try {
    await seed();
  } catch {
    // CLI failure may be an unknown external outcome. Read back before considering retry.
    if (bucketState(desired, await read()) !== "converged")
      throw new Error("Bucket seed outcome is unknown; readback has not proven convergence.");
    return { changed: true, recoveredByReadback: true, status: "converged" };
  }
  if (bucketState(desired, await read()) !== "converged")
    throw new Error("Bucket seed returned without the expected provider readback.");
  return { changed: true, status: "converged" };
}

async function readBucket(postgresUrl, id) {
  return withPostgres(postgresUrl, { remote: true }, async (client) => {
    const result = await client.query(
      "select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id=$1",
      [id],
    );
    if (result.rows.length > 1) throw new Error("Duplicate File Bucket evidence.");
    return result.rows[0] ?? null;
  });
}

function runSupabaseCli(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: fileURLToPath(root),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.error || result.status !== 0)
    throw new Error("Supabase CLI Bucket operation failed; provider readback is required.");
}

async function main() {
  const [action, ...other] = process.argv.slice(2);
  if (other.length !== 0 || !["plan", "verify", "sync"].includes(action))
    throw new Error("Usage: pnpm storage:remote <plan|verify|sync>");

  const desired = desiredFileBucket();
  const env = process.env;
  const postgresUrl = env.POSTGRES_URL_NON_POOLING ?? "";
  const projectRef = assertRemoteTarget(env.SUPABASE_URL ?? "", postgresUrl);
  assertConfirmedProject(projectRef, env.SUPABASE_CONFIRM_PROJECT);
  const read = () => readBucket(postgresUrl, desired.id);

  if (action === "plan" || action === "verify") {
    const state = bucketState(desired, await read());
    if (action === "verify" && state !== "converged")
      throw new Error("File Bucket is not converged.");
    console.log(
      JSON.stringify({ projectRef, id: desired.id, size: desired.size, private: true, state }),
    );
    return;
  }

  assertValidatedMainMutationContext(env);
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("Supabase provider access token is unavailable.");
  const sha = env.SUPABASE_RELEASE_SHA ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Exact storage release SHA is required.");
  const currentMain = () =>
    requireCurrentMain({
      sha,
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
    });
  await currentMain();
  const result = await reconcileBucket({
    desired,
    read,
    currentMain,
    link: async () => {
      runSupabaseCli(["link", "--project-ref", projectRef]);
      const linked = readFileSync(linkedProjectFile, "utf8").trim();
      if (linked !== projectRef)
        throw new Error("Supabase CLI link target does not match the confirmed project.");
    },
    seed: () => runSupabaseCli(["seed", "buckets", "--linked"]),
  });
  const evidence = { ...result, projectRef, id: desired.id, size: desired.size, private: true };
  const directory = new URL(".artifacts/supabase-remote/", root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    new URL("storage-bucket-readback.json", directory),
    JSON.stringify(evidence) + "\n",
  );
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Storage provider operation failed.");
    process.exitCode = 1;
  });
}
