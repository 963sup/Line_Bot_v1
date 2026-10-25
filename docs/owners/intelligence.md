# Intelligence

Intelligence owns document-understanding and processing lifecycle, provider-specific protocol, immutable ProcessingRun revisions, saved extraction evidence and processing receipts. It reads an authorized exact File source and never owns File bytes or target business facts. Repository retains authorization decisions.

## Boundary decision

Intelligence is an integration owner and application module. Processing lifecycle, provider attempts and saved interpretations change for reasons distinct from File source lifecycle and target business facts; Intelligence owns its processing evidence while target owners retain business truth.

No generic AI framework, provider router, schema registry, persistence model, Domain layer or empty Application layer is introduced. Assistant conversation and Issue-draft behavior remain Assistant-owned.

## Contract and dependency direction

File supplies an exact, already authorized `FileRevision` and bytes through its public source reader. Intelligence invokes processors and records run revisions and receipts.

```text
CLI / Web application host
├─ @line_bot_v1/file
└─ @line_bot_v1/intelligence
   ├─ @line_bot_v1/file public source contract
   └─ @line_bot_v1/repository public authorization contract
```

Contract intake is separate: Intelligence reads an exact File revision through File's public source reader, extracts a purchase-order candidate against Contract's supplied schema, and invokes Contract's public SAVE command. It cannot choose confirmation. The code dependencies are Intelligence → File, Contract, Repository and Platform. File never imports Intelligence, and Intelligence cannot access private File or Contract persistence.

## Trust and lifecycle

File owns source qualification and original bytes. Contract owns structured candidate validation and confirmation. Intelligence owns processing revisions and provider attempts; Repository owns current access authorization.

Gemini output is candidate evidence. Intelligence may submit it only through Contract's public SAVE command; it cannot authorize or confirm a Contract transition. Raw bytes, provider output, credentials and personal data must not enter diagnostic logs.

The existing processor identity remains `observations-v1:<model>`. Contract intake first records a durable technical attempt keyed by source and target intent. It keeps only source/intent identity, `STARTED` / `UNKNOWN` / `COMPLETED` state and a target receipt reference, never the candidate. Only a fresh attempt calls the provider; duplicate or unknown attempts read Contract's receipt and never make a second provider call. This is recovery for uncertain external delivery, not fallback or automatic retry. Supported Gemini inputs are PDF, JPEG, PNG and WebP. Native UTF-8 plain-text parsing is also an Intelligence processor. Excel/Word processors and standalone OCR, when implemented, belong here rather than in File because they interpret bytes and produce untrusted evidence; File remains format-neutral storage and source qualification.

## Processing retirement

New runs, result finalization, history reads and command receipts are Intelligence-owned. Each run pins one immutable File revision and SHA-256. Save/Discard append revisions; exact request replay returns its original receipt and never repeats provider I/O. Historical `file_processing_*` rows remain read-only during cutover; do not drop them or move `file_commands` wholesale because that table also records File commands. A separate retention/migration operation must verify exact counts and receipts before legacy rows can be retired.

## Deferred work

The attempt is a narrow technical record, not a generic AI framework or schema registry. Content/WBS expansion of a confirmed ContractDocument, broad document types, live provider acceptance and device workflows remain outside this capability.

## Evidence

Source lives in `packages/intelligence`; canonical ownership and dependency direction live in `architecture/semantic-model.json` and `architecture/implementation-topology.json`. Simulated provider tests verify protocol mapping, bounded failures, source/intent recovery and processor identity, but do not prove live Gemini availability, extraction accuracy, provider acceptance, production configuration or LINE-device behavior.
