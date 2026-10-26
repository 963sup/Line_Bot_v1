# Vercel AI Gateway integration

- Vercel AI provider runtime belongs under `vercel/integrations/`; it is not a workspace package.
- Consumers receive provider functions through Intelligence-facing ports; Assistant, File and Expense do not own provider clients or credentials.
- Node CLI uses `vercel/integrations/ai-gateway.mjs`; Web uses the typed integration source. Both use `AI_GATEWAY_MODEL`, AI SDK model strings, explicit timeouts and `maxRetries: 0`.
- Do not restore `GEMINI_*` fallback wiring or provider-specific compatibility exports.