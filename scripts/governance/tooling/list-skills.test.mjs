import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listSkills } from "./list-skills.mjs";

const validSkill = `---
name: demo
description: >
  Find installed skills for the demo workflow.
---

# Demo skill
`;

function fixture(t, { skill = validSkill, lockSkills = { demo: { source: "test/skills" } } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "line-bot-skills-"));
  const skillsRoot = join(root, "skills");
  const skillDirectory = join(skillsRoot, "demo");
  const lockPath = join(root, "skills-lock.json");
  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(join(skillDirectory, "SKILL.md"), skill);
  writeFileSync(lockPath, JSON.stringify({ version: 1, skills: lockSkills }));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { skillsRoot, skillPath: join(skillDirectory, "SKILL.md"), lockPath };
}

test("lists installed locked skills and reports lock-only entries", (t) => {
  const paths = fixture(t, {
    lockSkills: {
      demo: { source: "test/skills" },
      stale: { source: "test/skills" },
    },
  });

  assert.deepEqual(listSkills(paths), {
    skills: [{ name: "demo", description: "Find installed skills for the demo workflow." }],
    uninstalled: ["stale"],
  });
});

test("rejects installed skills missing from the lockfile", (t) => {
  const paths = fixture(t, { lockSkills: {} });

  assert.throws(() => listSkills(paths), /installed skill is missing from skills-lock\.json/);
});

test("rejects malformed frontmatter and accepts the repaired skill", (t) => {
  const paths = fixture(t, { skill: "---\nname: demo\ndescription: [broken\n---\n" });

  assert.throws(() => listSkills(paths));

  writeFileSync(paths.skillPath, validSkill);
  assert.deepEqual(listSkills(paths).skills, [
    { name: "demo", description: "Find installed skills for the demo workflow." },
  ]);
});

test("rejects metadata that does not match its installed directory", (t) => {
  const paths = fixture(t, {
    skill: validSkill.replace("name: demo", "name: another-skill"),
  });

  assert.throws(() => listSkills(paths), /expected matching name and string description metadata/);
});
