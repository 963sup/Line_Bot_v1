import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FPT_DIRECTORY = "architecture/domain/fpt";
const FPT_SOURCE = "architecture/domain/fpt-source.json";
const COLLECTIONS = Object.freeze([
  "queries",
  "mutations",
  "objects",
  "interfaces",
  "enums",
  "unions",
  "inputObjects",
  "scalars",
]);

function gitBlobSha(content) {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`, "utf8"), body]))
    .digest("hex");
}

export function indexFptDocuments(files) {
  const symbols = new Map();
  for (const [file, document] of Object.entries(files)) {
    for (const collection of COLLECTIONS) {
      const items = document?.[collection];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (typeof item?.name !== "string" || !item.name) continue;
        const key = `${file}:${item.name}`;
        const entries = symbols.get(key) ?? [];
        entries.push({ file, collection, item });
        symbols.set(key, entries);
      }
    }
  }
  return symbols;
}

function memberExists(item, field) {
  if (!field) return true;
  return ["fields", "args", "inputFields", "returnFields"].some((collection) =>
    (item?.[collection] ?? []).some((member) => member?.name === field),
  );
}

export function resolveFptReference(fpt, reference) {
  if (!reference || typeof reference.file !== "string" || typeof reference.symbol !== "string") {
    return null;
  }
  const entries = fpt?.symbols?.get(`${reference.file}:${reference.symbol}`) ?? [];
  const entry = entries.find(({ item }) => memberExists(item, reference.field));
  if (!entry) return null;
  return {
    file: entry.file,
    collection: entry.collection,
    symbol: entry.item.name,
    field: reference.field ?? null,
    item: entry.item,
  };
}

export function validateFptDomainTruth(fpt) {
  const errors = [];
  const manifest = fpt?.manifest;
  if (manifest?.version !== 1 || manifest?.role !== "github-fpt-domain-truth-provenance") {
    errors.push("FPT domain truth: expected version 1 github-fpt-domain-truth-provenance");
    return errors;
  }
  if (
    manifest?.upstream?.repository !== "github/docs" ||
    manifest?.upstream?.path !== "src/graphql/data/fpt" ||
    !/^[0-9a-f]{40}$/.test(manifest?.upstream?.revision ?? "")
  ) {
    errors.push("FPT domain truth: upstream provenance must pin github/docs src/graphql/data/fpt");
  }
  if (manifest?.domainTruth !== "architecture/domain/fpt/*.json") {
    errors.push("FPT domain truth: manifest must name the canonical local JSON mirror");
  }

  const entries = Array.isArray(manifest?.files) ? manifest.files : [];
  const names = entries.map((entry) => entry?.name);
  if (!entries.length || new Set(names).size !== names.length) {
    errors.push("FPT domain truth: provenance files must be a non-empty unique list");
  }
  if (JSON.stringify(names) !== JSON.stringify([...names].sort((a, b) => a.localeCompare(b)))) {
    errors.push("FPT domain truth: provenance files must be sorted");
  }

  const localNames = Object.keys(fpt?.raw ?? {}).sort((a, b) => a.localeCompare(b));
  if (
    JSON.stringify(localNames) !== JSON.stringify([...names].sort((a, b) => a.localeCompare(b)))
  ) {
    errors.push("FPT domain truth: local JSON mirror must exactly match the provenance file set");
  }

  for (const entry of entries) {
    if (
      typeof entry?.name !== "string" ||
      !entry.name.endsWith(".json") ||
      !/^[0-9a-f]{40}$/.test(entry?.gitBlobSha ?? "")
    ) {
      errors.push("FPT domain truth: every provenance entry needs a JSON name and Git blob SHA");
      continue;
    }
    const raw = fpt?.raw?.[entry.name];
    if (typeof raw !== "string") continue;
    if (gitBlobSha(raw) !== entry.gitBlobSha) {
      errors.push(
        `FPT domain truth: ${entry.name} does not match pinned upstream blob ${entry.gitBlobSha}`,
      );
    }
    try {
      JSON.parse(raw);
    } catch {
      errors.push(`FPT domain truth: ${entry.name} is not valid JSON`);
    }
  }
  if (!Object.hasOwn(fpt?.files ?? {}, "category-map.json")) {
    errors.push("FPT domain truth: category-map.json is required");
  }
  if (!(fpt?.symbols instanceof Map) || fpt.symbols.size === 0) {
    errors.push("FPT domain truth: schema symbols could not be indexed");
  }
  return errors;
}

export async function loadFptDomainTruth(root) {
  const manifest = JSON.parse(await readFile(resolve(root, FPT_SOURCE), "utf8"));
  const directory = resolve(root, FPT_DIRECTORY);
  const diskFiles = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  const raw = {};
  const files = {};
  for (const name of diskFiles) {
    const content = await readFile(resolve(directory, name), "utf8");
    raw[name] = content;
    files[name] = JSON.parse(content);
  }
  return { manifest, raw, files, symbols: indexFptDocuments(files) };
}
