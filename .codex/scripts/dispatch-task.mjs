import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../..", import.meta.url));
const atomicCatalogPath = resolve(root, ".codex/catalog/atomic-catalog.json");
const roleCatalogPath = resolve(root, ".codex/catalog/role-catalog.json");
const handoffSchemaPath = resolve(root, ".codex/schemas/handoff-result.schema.json");
const outputRoot = resolve(root, ".artifacts/codex-dispatch");

function fail(message) {
  console.error(JSON.stringify({ status: "blocked", error: message }));
  process.exitCode = 1;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validatePacket(packet) {
  const requiredFields = [
    "version",
    "goal",
    "scope",
    "inputs",
    "invariants",
    "deliverable",
    "stopCondition",
    "validationOwner",
  ];
  for (const field of requiredFields) required(packet[field], `packet.${field}`);
  if (packet.version !== 1) throw new Error("packet.version must be 1");
  for (const field of ["inputs", "invariants"]) {
    if (!Array.isArray(packet[field])) throw new Error(`packet.${field} must be an array`);
  }
  if (!Array.isArray(packet.scope.allowed) || !Array.isArray(packet.scope.excluded)) {
    throw new Error("packet.scope.allowed and packet.scope.excluded must be arrays");
  }
  required(packet.scope.allowed, "packet.scope.allowed");
  required(packet.scope.excluded, "packet.scope.excluded");
  if (!packet.atomicId) throw new Error("packet.atomicId is required for dispatch");
}

function resolveDispatch(packet) {
  const atomics = loadJson(atomicCatalogPath).atomics;
  const roles = loadJson(roleCatalogPath).roles;
  const atomic = atomics.find((entry) => entry.id === packet.atomicId);
  if (!atomic) throw new Error(`Unknown atomicId: ${packet.atomicId}`);
  if (atomic.status !== "enabled") throw new Error(`Atomic is not dispatchable: ${packet.atomicId}`);
  if (!atomic.executorRoleId) throw new Error(`Atomic has no executorRoleId: ${packet.atomicId}`);
  const role = roles.find((entry) => entry.id === atomic.executorRoleId);
  if (!role || role.status !== "enabled" || !role.profilePath) {
    throw new Error(`Executor role is not dispatchable: ${atomic.executorRoleId}`);
  }
  const profilePath = resolve(root, role.profilePath);
  if (!existsSync(profilePath)) throw new Error(`Profile does not exist: ${role.profilePath}`);
  return { atomic, role, profilePath, profile: readFileSync(profilePath, "utf8") };
}

function parseHandoff(output, expectedAtomicId) {
  const messages = output
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((event) => event?.type === "item.completed" && event.item?.type === "agent_message");
  const raw = messages.at(-1)?.item?.text ?? output.trim();
  if (!raw) throw new Error("Executor did not return an agent_message handoff");
  const handoff = JSON.parse(raw);
  validateHandoff(handoff);
  if (handoff.atomicId !== expectedAtomicId) {
    throw new Error(`Handoff atomicId mismatch: expected ${expectedAtomicId}`);
  }
  if (handoff.version !== 1 || !/^L[1-6]→L[1-6]: .+/.test(handoff.taskLayer)) {
    throw new Error("Handoff version/taskLayer is invalid");
  }
  if (!["complete", "needs-decision", "blocked"].includes(handoff.status)) {
    throw new Error(`Invalid handoff status: ${handoff.status}`);
  }
  return handoff;
}

function validateHandoff(handoff) {
  const schema = loadJson(handoffSchemaPath);
  for (const field of schema.required ?? []) {
    if (!(field in handoff)) throw new Error(`Handoff missing required field: ${field}`);
  }
  if (handoff.version !== 1) throw new Error("Handoff version must be 1");
  if (!/^L[1-6]→L[1-6]: .+/.test(handoff.taskLayer)) throw new Error("Handoff taskLayer is invalid");
  if (!["complete", "needs-decision", "blocked"].includes(handoff.status)) {
    throw new Error(`Invalid handoff status: ${handoff.status}`);
  }
  for (const field of ["candidate", "deliverable", "evidenceBoundary", "unresolvedRisk"]) {
    if (typeof handoff[field] !== "string" || !handoff[field].trim()) {
      throw new Error(`Handoff ${field} must be a non-empty string`);
    }
  }
  for (const field of ["verifiedFacts", "assumptions"]) {
    if (!Array.isArray(handoff[field]) || handoff[field].some((item) => typeof item !== "string")) {
      throw new Error(`Handoff ${field} must be an array of strings`);
    }
  }
  if (handoff.route !== "none") {
    if (!handoff.route || typeof handoff.route !== "object" || typeof handoff.route.id !== "string" ||
      !["Declared", "Eligible", "Available", "Executed", "Proven"].includes(handoff.route.state)) {
      throw new Error("Handoff route is invalid");
    }
  }
  if (!handoff.nextHandoff || !["L1", "L2", "L3", "L4", "L5", "L6"].includes(handoff.nextHandoff.layer) ||
    typeof handoff.nextHandoff.question !== "string" || !handoff.nextHandoff.question.trim()) {
    throw new Error("Handoff nextHandoff is invalid");
  }
}

function main() {
  const packetPath = required(arg("--packet"), "--packet <path>");
  const packet = loadJson(resolve(process.cwd(), packetPath));
  validatePacket(packet);
  const dispatch = resolveDispatch(packet);
  const plan = {
    version: 1,
    status: "planned",
    atomicId: dispatch.atomic.id,
    executorRoleId: dispatch.role.id,
    profilePath: dispatch.role.profilePath,
    goalPreview: String(packet.goal).slice(0, 160),
    scopeAllowedCount: packet.scope.allowed.length,
    scopeExcludedCount: packet.scope.excluded.length,
    validationOwner: packet.validationOwner,
  };
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan));
    return;
  }
  if (!process.argv.includes("--run")) throw new Error("Use exactly one of --plan or --run");

  mkdirSync(outputRoot, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const artifactPath = resolve(outputRoot, `${stamp}.jsonl`);
  const prompt = [
    "You are an assigned repository executor. Follow the supplied profile and task packet.",
    "Return only a JSON handoff result conforming to .codex/schemas/handoff-result.schema.json.",
    "Do not expand scope or perform external writes.",
    `\n[PROFILE]\n${dispatch.profile}`,
    `\n[TASK_PACKET]\n${JSON.stringify(packet, null, 2)}`,
  ].join("\n");
  const cli = process.env.CODEX_CLI || "codex";
  const handoffPath = resolve(outputRoot, `${stamp}.handoff.json`);
  const descriptor = openSync(artifactPath, "w");
  let result;
  try {
    result = spawnSync(cli, [
    "exec", "--json", "-o", handoffPath, "--sandbox", "read-only", "-C", root, prompt,
    ], { stdio: ["ignore", descriptor, descriptor], windowsHide: true });
  } finally {
    closeSync(descriptor);
  }
  let handoff = null;
  let handoffError = null;
  if (result.status === 0) {
    try {
      handoff = parseHandoff(
        existsSync(handoffPath) ? readFileSync(handoffPath, "utf8") : "",
        dispatch.atomic.id,
      );
    } catch (error) {
      handoffError = error instanceof Error ? error.message : String(error);
    }
  }
  const receipt = {
    ...plan,
    status: result.status !== 0 ? "failed" : handoffError ? "invalid-handoff" : handoff.status,
    exitCode: result.status !== 0 || handoffError || handoff?.status !== "complete" ? (result.status || 2) : 0,
    artifactPath,
    handoffPath: existsSync(handoffPath) ? handoffPath : null,
    handoffError,
  };
  console.log(JSON.stringify(receipt));
  if (result.error) throw result.error;
  if (result.status !== 0 || handoffError || handoff.status !== "complete") process.exitCode = result.status || 2;
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
