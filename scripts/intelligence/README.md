# Intelligence operator

`pnpm intelligence:run` reads one bounded JSON request from stdin and verifies its LINE `proof` before looking up any protected data. Never pass actor IDs, role claims, provider credentials or candidate payloads on argv. The current actor comes from the verified proof and the active account record.

| Operation | Request | Behavior |
| --- | --- | --- |
| `intake` | `command:{action:"save",repositoryId,documentId,requestId,expectedVersion,expectedLineCount,source:{fileId,fileRevisionId,fileSha256}}` | Reads that exact File revision through File's public capability, performs one configured Gemini extraction against Contract's purchase-order schema, and submits the candidate through Contract's public input. |
| `receipt` | `command:{repositoryId,documentId,requestId}` | Performs current actor-authorized Contract receipt readback. Use this after an unknown intake response before deciding whether a new provider attempt is appropriate. |

Set server-only `GEMINI_API_KEY` and `GEMINI_MODEL`; neither is accepted from stdin or printed. `expectedLineCount` must reflect the source's stated count; do not fabricate a count. Provider I/O has no PostgreSQL lock, automatic retry or fallback. Intelligence checks only command and File source identity. Contract remains authoritative for candidate validation, business meaning, authorization, confirmation and formal persistence.

The technical attempt receipt is reserved before provider I/O. A completed Contract receipt finalizes that attempt; an unknown provider or target outcome is retained and never triggers an automatic provider retry. `receipt` is the recovery readback after an unknown result.
