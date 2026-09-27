import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = path.join(root, "docs/convergence-manifest.json");
const ignored = new Set([".git", "node_modules", "dist", ".next", ".artifacts", ".vercel", ".turbo", ".temp"]);
const fileOutcomes = new Set(["keep", "updated", "distilled", "blocked", "reviewing"]);
const skillOutcomes = new Set(["keep", "refreshed", "blocked"]);

function normalize(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

async function collectMarkdown(directory = ".", output = []) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const relative = normalize(path.join(directory, entry.name));
    if (entry.isDirectory()) await collectMarkdown(relative, output);
    else if (entry.isFile() && entry.name.endsWith(".md")) output.push(relative);
  }
  return output;
}

function gitBlob(buffer) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest("hex");
}

async function fileFacts(relative) {
  const buffer = await readFile(path.join(root, relative));
  return { bytes: buffer.length, blob: gitBlob(buffer) };
}

async function loadJson(relative, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function loadState() {
  const manifest = await loadJson("docs/convergence-manifest.json", {
    version: 1,
    phase: "in-progress",
    files: {},
    upstreamSkills: {},
  });
  const lock = await loadJson("skills-lock.json", { version: 1, skills: {} });
  if (manifest.version !== 1) throw new Error(`Unsupported convergence manifest version: ${manifest.version}`);
  if (!new Set(["in-progress", "complete"]).has(manifest.phase))
    throw new Error(`Invalid convergence phase: ${manifest.phase}`);
  manifest.files ??= {};
  manifest.upstreamSkills ??= {};
  return { manifest, lock };
}

function lockedSkillFor(relative, lock) {
  const match = relative.match(/^\.agents\/skills\/([^/]+)\//);
  if (!match) return null;
  const skill = lock.skills?.[match[1]];
  return skill ? { name: match[1], ...skill } : null;
}

async function inspect({ requireComplete = false } = {}) {
  const { manifest, lock } = await loadState();
  const markdown = (await collectMarkdown()).sort();
  const current = new Set(markdown);
  const rows = [];
  const errors = [];

  for (const [relative, entry] of Object.entries(manifest.files)) {
    if (!fileOutcomes.has(entry.outcome)) errors.push(`${relative}: invalid outcome ${entry.outcome}`);
    if (!current.has(relative)) errors.push(`${relative}: manifest entry has no current Markdown file`);
  }

  for (const relative of markdown) {
    const locked = lockedSkillFor(relative, lock);
    if (locked) {
      const review = manifest.upstreamSkills[locked.name];
      if (!review) rows.push({ path: relative, status: "upstream-pending", skill: locked.name });
      else if (!skillOutcomes.has(review.outcome)) {
        errors.push(`skill:${locked.name}: invalid outcome ${review.outcome}`);
        rows.push({ path: relative, status: "upstream-stale", skill: locked.name });
      } else if (review.lockHash !== locked.computedHash)
        rows.push({ path: relative, status: "upstream-stale", skill: locked.name });
      else if (review.outcome === "blocked") rows.push({ path: relative, status: "blocked", skill: locked.name });
      else rows.push({ path: relative, status: "upstream-reviewed", skill: locked.name });
      continue;
    }

    const entry = manifest.files[relative];
    if (!entry) {
      rows.push({ path: relative, status: "pending" });
      continue;
    }

    const facts = await fileFacts(relative);
    let status =
      entry.outcome === "blocked" ? "blocked" : entry.outcome === "reviewing" ? "reviewing" : "reviewed";

    if (entry.maxBytes != null && facts.bytes > entry.maxBytes) {
      errors.push(`${relative}: grew from reviewed max ${entry.maxBytes} to ${facts.bytes} bytes`);
      status = "stale";
    }
    if (entry.outcome !== "reviewing") {
      if (entry.contentBlob && facts.blob !== entry.contentBlob) status = "stale";
      for (const [source, expectedBlob] of Object.entries(entry.sources ?? {})) {
        try {
          if ((await fileFacts(source)).blob !== expectedBlob) status = "stale";
        } catch {
          status = "stale";
          errors.push(`${relative}: missing authority source ${source}`);
        }
      }
    }
    rows.push({ path: relative, status });
  }

  for (const [name, review] of Object.entries(manifest.upstreamSkills)) {
    const locked = lock.skills?.[name];
    if (!locked) errors.push(`skill:${name}: review has no skills-lock entry`);
    else if (review.lockHash !== locked.computedHash)
      errors.push(`skill:${name}: skills-lock hash changed since review`);
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const incomplete =
    (counts.pending ?? 0) +
    (counts.reviewing ?? 0) +
    (counts.stale ?? 0) +
    (counts["upstream-pending"] ?? 0) +
    (counts["upstream-stale"] ?? 0) +
    (counts.blocked ?? 0);
  const strict = requireComplete || manifest.phase === "complete";
  if (strict && incomplete > 0)
    errors.push(`convergence incomplete: ${incomplete} Markdown outcomes unresolved`);

  return { manifest, lock, rows, counts, errors, markdownCount: markdown.length, incomplete };
}

function lastModified(relative) {
  const result = spawnSync("git", ["log", "-1", "--format=%ct", "--", relative], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return Number.MAX_SAFE_INTEGER;
  const value = Number(result.stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

async function writeManifest(manifest) {
  const ordered = {
    version: 1,
    phase: manifest.phase,
    files: Object.fromEntries(Object.entries(manifest.files ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    upstreamSkills: Object.fromEntries(
      Object.entries(manifest.upstreamSkills ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  await writeFile(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);
}

function parseFlags(args) {
  const sources = [];
  let note = null;
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--source") sources.push(args[++index]);
    else if (args[index] === "--note") note = args[++index];
    else rest.push(args[index]);
  }
  return { rest, sources, note };
}

async function begin(relative) {
  const { manifest, lock } = await loadState();
  if (lockedSkillFor(relative, lock))
    throw new Error(`Use review-skill for imported skill corpus: ${relative}`);

  const facts = await fileFacts(relative);
  const previous = manifest.files[relative];
  manifest.files[relative] = {
    outcome: "reviewing",
    baselineBytes: previous?.maxBytes ?? facts.bytes,
    baselineBlob: previous?.contentBlob ?? facts.blob,
    maxBytes: previous?.maxBytes ?? facts.bytes,
    contentBlob: facts.blob,
    sources: previous?.sources ?? {},
  };
  await writeManifest(manifest);
  console.log(`${relative}: review started at ${facts.bytes} bytes`);
}

async function record(relative, outcome, sources, note) {
  if (!new Set(["keep", "updated", "distilled", "blocked"]).has(outcome))
    throw new Error(`Invalid record outcome: ${outcome}`);

  const { manifest, lock } = await loadState();
  if (lockedSkillFor(relative, lock))
    throw new Error(`Use review-skill for imported skill corpus: ${relative}`);

  const previous = manifest.files[relative];
  if (!previous || previous.outcome !== "reviewing")
    throw new Error(`Run begin before record: ${relative}`);

  const facts = await fileFacts(relative);
  if (facts.bytes > previous.baselineBytes)
    throw new Error(`${relative}: ${facts.bytes} bytes exceeds review baseline ${previous.baselineBytes}`);
  if (new Set(["updated", "distilled"]).has(outcome) && facts.blob === previous.baselineBlob)
    throw new Error(`${relative}: ${outcome} requires a content change`);
  if (new Set(["updated", "distilled"]).has(outcome) && facts.bytes >= previous.baselineBytes)
    throw new Error(
      `${relative}: edited Markdown must shrink (${previous.baselineBytes} -> ${facts.bytes})`,
    );

  const sourceMap = {};
  const sourcePaths = sources.length ? sources : Object.keys(previous.sources ?? {});
  for (const source of sourcePaths) {
    const normalized = normalize(source);
    sourceMap[normalized] = (await fileFacts(normalized)).blob;
  }

  manifest.files[relative] = {
    outcome,
    baselineBytes: previous.baselineBytes,
    maxBytes: Math.min(previous.maxBytes ?? previous.baselineBytes, facts.bytes),
    contentBlob: facts.blob,
    sources: sourceMap,
    ...(note ? { note } : {}),
  };
  await writeManifest(manifest);
  console.log(`${relative}: ${outcome}, ${previous.baselineBytes} -> ${facts.bytes} bytes`);
}

async function retire(relative, disposition, target = null) {
  if (!new Set(["deleted", "moved", "merged"]).has(disposition))
    throw new Error(`Invalid retire disposition: ${disposition}`);
  const { manifest, lock } = await loadState();
  if (lockedSkillFor(relative, lock))
    throw new Error(`Use review-skill for imported skill corpus: ${relative}`);
  const previous = manifest.files[relative];
  if (!previous || previous.outcome !== "reviewing")
    throw new Error(`Run begin before retire: ${relative}`);
  try {
    await fileFacts(relative);
    throw new Error(`${relative}: file still exists; retire only after move/merge/delete`);
  } catch (error) {
    if (!String(error?.message ?? error).includes("ENOENT") && !String(error?.code ?? "").includes("ENOENT"))
      throw error;
  }
  if (disposition !== "deleted") {
    if (!target) throw new Error(`${disposition} requires a target path`);
    await fileFacts(normalize(target));
  }
  delete manifest.files[relative];
  await writeManifest(manifest);
  console.log(`${relative}: ${disposition}${target ? ` -> ${normalize(target)}` : ""}`);
}

async function reviewSkill(name, outcome) {
  if (!skillOutcomes.has(outcome)) throw new Error(`Invalid skill outcome: ${outcome}`);
  const { manifest, lock } = await loadState();
  const skill = lock.skills?.[name];
  if (!skill) throw new Error(`Unknown locked skill: ${name}`);

  manifest.upstreamSkills[name] = {
    outcome,
    lockHash: skill.computedHash,
    source: skill.source,
    ...(skill.ref ? { ref: skill.ref } : {}),
    skillPath: skill.skillPath,
  };
  await writeManifest(manifest);
  console.log(`skill:${name}: ${outcome} @ ${skill.computedHash}`);
}

async function seal() {
  const report = await inspect({ requireComplete: true });
  if (report.errors.length) {
    for (const error of report.errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  report.manifest.phase = "complete";
  await writeManifest(report.manifest);
  console.log("Markdown convergence sealed: phase=complete");
}

async function main() {
  const [command = "status", ...args] = process.argv.slice(2);
  if (command === "seal") return seal();
  if (command === "begin") return begin(normalize(args[0] ?? ""));
  if (command === "retire") return retire(normalize(args[0] ?? ""), args[1], args[2] ?? null);
  if (command === "record") {
    const { rest, sources, note } = parseFlags(args);
    return record(normalize(rest[0] ?? ""), rest[1], sources, note);
  }
  if (command === "review-skill") return reviewSkill(args[0], args[1]);

  const report = await inspect({ requireComplete: command === "complete" });
  if (command === "next") {
    const limit = Number(args[0] ?? 10);
    for (const row of report.rows
      .filter((item) => !new Set(["reviewed", "upstream-reviewed"]).has(item.status))
      .map((item) => ({ ...item, modified: lastModified(item.path) }))
      .sort((a, b) => a.modified - b.modified || a.path.localeCompare(b.path))
      .slice(0, Number.isFinite(limit) ? limit : 10))
      console.log(`${row.status}\t${row.path}`);
  } else if (command === "status" || command === "check" || command === "complete") {
    console.log(`Markdown: ${report.markdownCount}; unresolved: ${report.incomplete}`);
    console.log(JSON.stringify(report.counts));
  } else if (command === "json") console.log(JSON.stringify(report, null, 2));
  else throw new Error(`Unknown command: ${command}`);

  if (report.errors.length) {
    for (const error of report.errors) console.error(error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Convergence failed: ${error.message}`);
  process.exitCode = 1;
});
