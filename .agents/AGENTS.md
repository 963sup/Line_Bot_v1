# Agent capability scope

Project task entrypoints live in `.github/prompts/`; Codex role configuration lives in `.codex/agents/`. Root and nearest AGENTS define repository constraints.

Keep `.agents/skills/` only for project-specific knowledge with a concrete consumer. Do not vendor general framework guides already available through runtime skills or official documentation. Skills do not own product truth or duplicate repository checks.

No Markdown review database, mandatory byte quotas or per-file review ceremony. Check links and correctness through ordinary review and `pnpm docs:check`.
