import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function splitLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitAdapter(cwd) {
  return {
    run(args, { optional = false } = {}) {
      const result = spawnSync("git", args, { cwd, encoding: "utf8" });
      if (!result.error && result.status === 0) return result.stdout.trim();
      if (optional) return null;
      throw new Error(`git ${args.join(" ")} failed.`);
    },
  };
}

export function parseAheadBehind(value) {
  const [behind, ahead] = String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    return { behind: null, ahead: null };
  }
  return { behind, ahead };
}

export function collectChangeState({ cwd = repositoryRoot, git = gitAdapter(cwd) } = {}) {
  const branch =
    git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], { optional: true }) ?? "DETACHED";
  const head = git.run(["rev-parse", "HEAD"]);
  const upstream = git.run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
    optional: true,
  });
  const originMain = git.run(["rev-parse", "--verify", "origin/main"], { optional: true });
  const porcelain = git.run(["status", "--porcelain=v1", "--untracked-files=all"]);
  const conflicts = splitLines(
    git.run(["diff", "--name-only", "--diff-filter=U"], { optional: true }),
  );
  const branchFiles = originMain
    ? splitLines(
        git.run(["diff", "--name-only", "--diff-filter=ACMRD", "origin/main...HEAD"], {
          optional: true,
        }),
      )
    : [];
  const workspaceFiles = [
    ...splitLines(
      git.run(["diff", "--name-only", "--diff-filter=ACMRD", "HEAD"], { optional: true }),
    ),
    ...splitLines(
      git.run(["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], { optional: true }),
    ),
    ...splitLines(git.run(["ls-files", "--others", "--exclude-standard"], { optional: true })),
  ];
  const counts = originMain
    ? parseAheadBehind(
        git.run(["rev-list", "--left-right", "--count", "origin/main...HEAD"], {
          optional: true,
        }),
      )
    : { behind: null, ahead: null };

  return {
    branch,
    head,
    upstream,
    originMain,
    ahead: counts.ahead,
    behind: counts.behind,
    clean: porcelain.length === 0,
    conflicts,
    branchFiles: [...new Set(branchFiles)].sort(),
    workspaceFiles: [...new Set(workspaceFiles)].sort(),
  };
}

export function evaluatePreflight(state) {
  const issues = [];
  if (state.branch === "DETACHED") {
    issues.push({ code: "detached-head", message: "HEAD must be on a named feature branch." });
  } else if (state.branch === "main") {
    issues.push({
      code: "main-branch",
      message: "Preflight must run from the change branch, not main.",
    });
  }
  if (!state.upstream) {
    issues.push({
      code: "missing-upstream",
      message: "The change branch must have an upstream remote.",
    });
  }
  if (!state.originMain) {
    issues.push({
      code: "missing-origin-main",
      message: "origin/main is unavailable; fetch the latest main before preflight.",
    });
  }
  if (state.behind === null) {
    if (state.originMain) {
      issues.push({
        code: "unknown-divergence",
        message: "Unable to compare the branch with origin/main.",
      });
    }
  } else if (state.behind > 0) {
    issues.push({
      code: "behind-main",
      message: `Branch is behind origin/main by ${state.behind} commit(s).`,
    });
  }
  if (!state.clean) {
    issues.push({ code: "dirty-worktree", message: "Working tree must be clean." });
  }
  if (state.conflicts.length) {
    issues.push({
      code: "conflicts",
      message: `Unresolved conflicts: ${state.conflicts.join(", ")}`,
    });
  }
  return issues;
}
