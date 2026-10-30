# integration-openai constraints

Parent rules: [packages/AGENTS.md](../AGENTS.md).

- This package owns only the server-side OpenAI Responses transport and provider error/input boundary.
- Keep official environment variables server-only: `OPENAI_API_KEY` is required; `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID` are optional metadata.
- Do not add Vercel AI Gateway credentials, `NEXT_PUBLIC_` variants, provider fallback clients, persistence, authorization, prompts, or business validation here.
- Callers must bound input bytes/pages, output, timeout and duplicate/retry behavior; provider output remains untrusted until the owning package validates it.
- Run this package's typecheck and tests for transport changes.
