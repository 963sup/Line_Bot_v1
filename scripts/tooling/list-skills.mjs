import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const skillsRoot = resolve(repositoryRoot, ".agents/skills");
const lockPath = resolve(repositoryRoot, "skills-lock.json");

function readSkill(skillDirectory) {
  const skillPath = resolve(skillsRoot, skillDirectory, "SKILL.md");
  const source = readFileSync(skillPath, "utf8");
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error(`${skillPath}: missing YAML frontmatter`);

  const metadata = YAML.parse(frontmatter[1]);
  if (metadata?.name !== skillDirectory || typeof metadata.description !== "string") {
    throw new Error(`${skillPath}: expected matching name and string description metadata`);
  }

  return { name: metadata.name, description: metadata.description.replace(/\s+/g, " ").trim() };
}

function listSkills() {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (!lock.skills || typeof lock.skills !== "object") {
    throw new Error(`${lockPath}: expected a skills object`);
  }

  const directories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills = directories.map((directory) => {
    if (!Object.hasOwn(lock.skills, directory)) {
      throw new Error(`${directory}: installed skill is missing from skills-lock.json`);
    }
    return readSkill(directory);
  });

  return {
    skills,
    uninstalled: Object.keys(lock.skills).filter((name) => !directories.includes(name)),
  };
}

const query = process.argv.slice(2).join(" ").trim().toLowerCase();
try {
  const { skills: installed, uninstalled } = listSkills();
  const skills = installed.filter((skill) =>
    `${skill.name} ${skill.description}`.toLowerCase().includes(query),
  );

  if (uninstalled.length) {
    console.warn(`Lock entries without installed skills: ${uninstalled.join(", ")}`);
  }

  if (skills.length === 0) {
    console.log(query ? `No skills match: ${query}` : "No installed skills found.");
  } else {
    const width = Math.max(...skills.map(({ name }) => name.length));
    for (const skill of skills) {
      const description =
        skill.description.length > 180
          ? `${skill.description.slice(0, 177).trimEnd()}...`
          : skill.description;
      console.log(`${skill.name.padEnd(width)}  ${description}`);
    }
  }
} catch (error) {
  console.error(`${basename(import.meta.filename)}: ${error.message}`);
  process.exitCode = 1;
}
