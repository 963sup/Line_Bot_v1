import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  indexFptDocuments,
  resolveFptReference,
  validateFptDomainTruth,
} from "./fpt-domain-core.mjs";

function blobSha(content) {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`, "utf8"), body]))
    .digest("hex");
}
function fixture() {
  const raw = {
    "category-map.json": JSON.stringify({ objects: { repository: "repos" } }),
    "schema-repos.json": JSON.stringify({
      queries: [],
      mutations: [],
      objects: [
        { name: "Repository", fields: [{ name: "name", type: "String!" }], category: "repos" },
      ],
      interfaces: [],
      enums: [],
      unions: [],
      inputObjects: [],
    }),
  };
  const files = Object.fromEntries(
    Object.entries(raw).map(([name, content]) => [name, JSON.parse(content)]),
  );
  const names = Object.keys(raw).sort((a, b) => a.localeCompare(b));
  const manifest = {
    version: 1,
    role: "github-fpt-domain-truth-provenance",
    domainTruth: "architecture/domain/fpt/*.json",
    upstream: {
      repository: "github/docs",
      revision: "0123456789abcdef0123456789abcdef01234567",
      path: "src/graphql/data/fpt",
    },
    contract: {
      mirror: "exact-json-content",
      authority: "canonical-local-domain-truth",
    },
    files: names.map((name) => ({ name, gitBlobSha: blobSha(raw[name]) })),
  };
  return { manifest, raw, files, symbols: indexFptDocuments(files) };
}
test("accepts an exact pinned FPT JSON mirror", () =>
  assert.deepEqual(validateFptDomainTruth(fixture()), []));

test("rejects provenance that demotes FPT from canonical local domain truth", () => {
  const fpt = fixture();
  fpt.manifest.contract.authority = "benchmark-only";
  assert.match(validateFptDomainTruth(fpt).join("\n"), /canonical-local-domain-truth authority/);
});
test("rejects local FPT mutation instead of accepting a second domain truth", () => {
  const fpt = fixture();
  fpt.raw["schema-repos.json"] = JSON.stringify({ objects: [] });
  assert.match(validateFptDomainTruth(fpt).join("\n"), /does not match pinned upstream blob/);
});
test("rejects missing or extra local FPT JSON files", () => {
  const fpt = fixture();
  delete fpt.raw["schema-repos.json"];
  assert.match(validateFptDomainTruth(fpt).join("\n"), /must exactly match/);
});
test("resolves symbols and fields directly from FPT JSON", () => {
  const fpt = fixture();
  assert.equal(
    resolveFptReference(fpt, { file: "schema-repos.json", symbol: "Repository", field: "name" })
      ?.collection,
    "objects",
  );
  assert.equal(
    resolveFptReference(fpt, { file: "schema-repos.json", symbol: "Repository", field: "missing" }),
    null,
  );
});
