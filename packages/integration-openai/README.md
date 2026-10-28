# OpenAI Responses Structured Outputs

Direct HTTPS Responses API transport with strict `text.format` JSON Schema, `store: false`, bounded timeout and no automatic retries. PDF uses `input_file`; images use `input_image`. Refusal, incomplete output and malformed responses fail explicitly without exposing provider response bodies.

Server environment uses official names: required `OPENAI_API_KEY`, optional `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID`. Existing Vercel environment configuration is sufficient. No `NEXT_PUBLIC_` credentials or custom model environment variable is introduced. Intelligence composition currently selects `gpt-4.1` in code.

Callers own schemas, instructions, business validation and request/recovery lifecycle. Integration has no dependency on Vercel or business packages. Tests use injected fetch and never require a live key.

## Canonical provider boundary

This package owns the OpenAI HTTP transport, official environment variable names, input/output limits, timeout, refusal/incomplete handling, and provider error mapping. It does not own model selection policy, prompts, persistence, authorization, or product state transitions; those belong to `intelligence`, `assistant`, `contract`, `file`, or the relevant owner.

`OPENAI_API_KEY` is required. `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID` are optional server-only provider metadata. Do not introduce `NEXT_PUBLIC_` variants, custom model secrets, Vercel AI Gateway variables, provider fallback clients, or credentials in logs and browser bundles.

Every caller must bound source bytes, PDF pages, output tokens, timeout and duplicate/retry behavior before invoking the transport. Oversized or malformed input fails before a billable request; the transport does not silently truncate source content or retry automatically. Provider output is untrusted until the caller validates its schema and business rules.

For document intake, `packages/intelligence` owns processor identity, source/attempt recovery, prompt contract and untrusted-result handling; `packages/contract` owns candidate validation and confirmation; `packages/file` owns source authorization and readback. This package remains a replaceable adapter.
