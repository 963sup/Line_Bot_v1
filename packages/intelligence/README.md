# Intelligence

`@line_bot_v1/intelligence` owns document-understanding orchestration and provider adapters. Its module kind is application orchestration with provider integration; it is not a business Bounded Context. It keeps a durable technical attempt receipt only for recovery, never Contract candidate or revision facts.

The new public intake composition uses File's exact authorized source reader, a target-owned versioned schema and the target's public input contract. The first target is Contract's purchase-order schema. Contract rechecks authorization and source identity at commit and owns candidate validation, revisions and receipts. Intelligence performs one provider request without database locks, retry or fallback. Hosts compose these public capabilities; File never imports Intelligence.

Processing adapters and their `observations-v1:<model>` identity belong to Intelligence. The intake extractor supports PDF/JPEG/PNG/WebP and sends the injected target schema to Gemini; candidates remain untrusted until Contract accepts them.

Run `pnpm intelligence:run` with bounded JSON on stdin. `proof` is verified as a current LINE identity; actor and role fields are never trusted. `operation:"intake"` accepts only `action:"save"` and requires an explicit complete command plus configured `GEMINI_API_KEY` / `GEMINI_MODEL`; `operation:"receipt"` performs authorized target readback. A matching receipt completes the reserved technical attempt without rerunning extraction. An unknown provider-only outcome remains unknown and is never retried automatically.

See [package constraints](AGENTS.md), [semantic model](../../architecture/semantic-model.json) and [implementation topology](../../architecture/implementation-topology.json).
