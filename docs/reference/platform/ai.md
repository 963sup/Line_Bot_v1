# AI platform reference

AI provider transport 與設定內容由對應 integration package 擁有。本文件只提供跨 package 的責任分類，不維護第二套 provider contract。

## Canonical content

- OpenAI Responses transport、official environment variables、input/output limits 與 provider errors：[integration-openai README](../../../packages/integration-openai/README.md)。
- Vercel AI Gateway transport、model／credential boundary 與 provider limits：[integration-vercel README](../../../packages/integration-vercel/src/README.md)。
- Document intake、processor identity、source／attempt recovery 與 untrusted result：[Intelligence](../../owners/intelligence.md) 與 `packages/intelligence`。
- Contract candidate validation、confirmation、version 與 command receipt：[Contract](../../owners/contract.md) 與 `packages/contract`。
- Assistant conversation 與 model port：[Assistant](../../owners/assistant.md) 與 `packages/assistant`。
- File source authorization、readback 與 object lifecycle：[File](../../owners/file.md) 與 `packages/file`。

## Cross-owner principles

AI is never authorization, persistent business truth, or a substitute for deterministic validation. Callers must bound input, output, timeout, retries, duplicate handling and total operation cost; provider output remains untrusted until the owning package validates it. Usage and quality evidence must not retain credentials, unnecessary PII or complete sensitive prompts.

## Retained references

Cost measurement, retention and secrets remain cross-cutting concerns owned by the corresponding [engineering rules](../engineering/) and [security references](../security/). Provider-specific details belong in the integration package above.
