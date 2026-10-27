# OpenAI Responses Structured Outputs

Direct HTTPS Responses API transport with strict `text.format` JSON Schema, `store: false`, bounded timeout and no automatic retries. PDF uses `input_file`; images use `input_image`. Refusal, incomplete output and malformed responses fail explicitly without exposing provider response bodies.

Server environment uses official names: required `OPENAI_API_KEY`, optional `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID`. Existing Vercel environment configuration is sufficient. No `NEXT_PUBLIC_` credentials or custom model environment variable is introduced. Intelligence composition currently selects `gpt-4.1` in code.

Callers own schemas, instructions, business validation and request/recovery lifecycle. Integration has no dependency on Vercel or business packages. Tests use injected fetch and never require a live key.
