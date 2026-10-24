# Intelligence

Intelligence owns provider-specific document-understanding protocol and technical orchestration. It reads an authorized File source, extracts against the target owner's schema, and submits only an untrusted target candidate. It owns provider SDK behavior, media mapping, prompt construction, operation deadline and provider/model identity; it never owns Contract, Content, WBS, File bytes or business authorization.

## Boundary decision

Intelligence is an integration owner and application module, not an independent business Bounded Context. The boundary exists because provider SDK compatibility, prompt/schema evolution, model behavior and extraction quality change for reasons distinct from File evidence lifecycle rules. It coordinates technical external work while the target owner keeps business truth.

No generic AI framework, provider router, schema registry, persistence model, Domain layer or empty Application layer is introduced. Assistant conversation and Issue-draft behavior remain Assistant-owned.

## Contract and dependency direction

Intelligence implements File's public `FileProcessor` port. File supplies an exact, already authorized `FileRevision` and bytes; Intelligence returns untrusted candidate output or a bounded provider failure.

```text
CLI / Web application host
├─ @line_bot_v1/file
└─ @line_bot_v1/intelligence
   └─ @line_bot_v1/file public processor contract
```

The existing File processor remains current. The Contract intake is separate: Intelligence reads an exact File revision through File's public source reader, extracts a purchase-order candidate against Contract's supplied schema, and invokes Contract's public SAVE command. It cannot choose confirmation. The code dependencies are Intelligence → File, Contract and Platform. File never imports Intelligence, and Intelligence cannot access private File or Contract persistence.

## Trust and lifecycle

File owns source qualification and original bytes. Contract owns structured candidate validation, authorization, revision and confirmation. Intelligence owns provider protocol and technical attempt recovery.

Gemini output is candidate evidence. Intelligence may submit it only through Contract's public SAVE command; it cannot authorize or confirm a Contract transition. Raw bytes, provider output, credentials and personal data must not enter diagnostic logs.

The existing processor identity remains `observations-v1:<model>`. Contract intake first records a durable technical attempt keyed by source and target intent. It keeps only source/intent identity, `STARTED` / `UNKNOWN` / `COMPLETED` state and a target receipt reference, never the candidate. Only a fresh attempt calls the provider; duplicate or unknown attempts read Contract's receipt and never make a second provider call. This is recovery for uncertain external delivery, not fallback or automatic retry. Supported Gemini inputs are PDF, JPEG, PNG and WebP. Native UTF-8 plain-text parsing remains File-owned.

## Deferred work

The attempt is a narrow technical record, not a generic AI framework or schema registry. Content/WBS expansion of a confirmed ContractDocument, broad document types, live provider acceptance and device workflows remain outside this capability.

## Evidence

Source lives in `packages/intelligence`; canonical ownership and dependency direction live in `architecture/semantic-model.json` and `architecture/implementation-topology.json`. Simulated provider tests verify protocol mapping, bounded failures, source/intent recovery and processor identity, but do not prove live Gemini availability, extraction accuracy, provider acceptance, production configuration or LINE-device behavior.
