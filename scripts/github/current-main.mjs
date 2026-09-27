import { pathToFileURL } from "node:url";
import { githubJson, requireRepository } from "./api.mjs";

export function parseExactSha(argv) {
  if (argv.length !== 2 || argv[0] !== "--sha" || !/^[0-9a-f]{40}$/.test(argv[1] ?? "")) {
    throw new Error("Usage: pnpm github:current-main --sha <40-hex-sha>");
  }
  return argv[1];
}

export async function requireCurrentMain({ sha, repository, token, fetchImpl = fetch }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("Exact commit SHA is required.");
  const target = requireRepository(repository);
  const branch = await githubJson(`/repos/${target}/branches/main`, { token, fetchImpl });
  const current = branch?.commit?.sha;
  if (current !== sha) {
    throw new Error(`Release SHA ${sha} is not current main (${current ?? "unknown"}).`);
  }
  return { repository: target, branch: "main", sha };
}

async function main() {
  const sha = parseExactSha(process.argv.slice(2));
  const result = await requireCurrentMain({
    sha,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
