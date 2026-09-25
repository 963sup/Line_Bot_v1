import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = [];
const generated = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  ".artifacts",
  ".vercel",
  ".turbo",
  ".temp",
]);
const errors = [];
let links = 0;

async function collect(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    const normalized = relative.split(path.sep).join("/");
    if (entry.isFile() && normalized.startsWith("docs/090-governance/090-history/")) {
      errors.push(`${normalized}: raw governance history must live in Git history, not the current tree`);
    }
    if (entry.isDirectory() && !generated.has(entry.name)) await collect(relative);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative);
  }
}

try {
  await collect(".");
  for (const file of files) {
    if (file.split(path.sep)[0] === "docs") {
      const name = path.basename(file);
      const numbered = name.match(/^(\d{3})-[a-z0-9][a-z0-9-]*\.md$/i);
      if (
        !["README.md", "AGENTS.md"].includes(name) &&
        (!numbered || Number(numbered[1]) === 0 || Number(numbered[1]) % 10 !== 0)
      )
        errors.push(`${file}: docs content file must use 010-name.md interval numbering`);
    }
    const source = await readFile(path.join(root, file), "utf8");
    let fence = null;
    const prose = [];
    let frontmatter =
      source.replace(/^\uFEFF/, "").startsWith("---\n") ||
      source.replace(/^\uFEFF/, "").startsWith("---\r\n");
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (/^(<{7}|={7}|>{7})(?:\s|$)/.test(line))
        errors.push(`${file}:${index + 1}: conflict marker`);
      if (frontmatter) {
        if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
        continue;
      }
      const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
          fence = null;
        continue;
      }
      if (!fence) prose.push(line);
    }
    if (fence) errors.push(`${file}: unclosed code fence`);
    if (frontmatter) errors.push(`${file}: unclosed frontmatter`);
    for (const match of prose.join("\n").matchAll(/\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)\)/g)) {
      const href = match[1].replace(/^<|>$/g, "");
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue;
      const target = decodeURIComponent(href.split(/[?#]/)[0]);
      if (!target) continue;
      links++;
      try {
        await stat(path.resolve(root, path.dirname(file), target));
      } catch {
        errors.push(`${file}: missing local link ${href}`);
      }
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log(`Docs OK: ${files.length} Markdown files, ${links} local links.`);
} catch (error) {
  console.error(`Docs check failed: ${error.message}`);
  process.exitCode = 1;
}
