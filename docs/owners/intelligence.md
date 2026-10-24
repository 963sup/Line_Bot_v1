# Intelligence

Intelligence owns provider-specific document-understanding integration. Its current implementation translates an explicitly supplied PDF or image into bounded, source-located candidate observations through Gemini. It owns the provider protocol, extraction prompt and response schema, supported media mapping, operation timeout and processor version identity.

## Boundary decision

Intelligence is an integration owner and integration adapter, not an independent business Bounded Context. The boundary exists because provider SDK compatibility, prompt/schema evolution, model behavior and extraction quality change for reasons distinct from File evidence lifecycle rules. The same adapter is composed by the File CLI and Web host, so this is a real technical boundary rather than placeholder scaffolding.

No generic AI framework, provider router, schema registry, persistence model, Domain layer or empty Application layer is introduced. Assistant conversation and Issue-draft behavior remain Assistant-owned.

## Contract and dependency direction

Intelligence implements File's public `FileProcessor` port. File supplies an exact, already authorized `FileRevision` and bytes; Intelligence returns untrusted candidate output or a bounded provider failure.

```text
CLI / Web application host
├─ @line_bot_v1/file
└─ @line_bot_v1/intelligence
   └─ @line_bot_v1/file public processor contract
```

The code dependency is Intelligence → File. Application hosts inject the configured processor into File at composition time. File never imports Intelligence, and Intelligence cannot access File persistence, Storage credentials, Repository authorization or private contracts.

## Trust and lifecycle

File owns source qualification, exact revision readback, authorization, processor selection, output validation, ProcessingRun/RawResult/SavedResult lifecycle, attempt fencing, replay and recovery. Intelligence owns only the external document-understanding request/response protocol.

Gemini output is candidate evidence. It does not authorize Save, become a verified measurement, or mutate Contract, Content, Resources, WBS, Execution or another Domain. Raw bytes, provider output, credentials and personal data must not enter diagnostic logs.

The current processor identity remains `observations-v1:<model>`. It makes one bounded provider attempt with the existing operation deadline and has no automatic retry, fallback or background execution. Supported Gemini inputs are PDF, JPEG, PNG and WebP. Native UTF-8 plain-text parsing remains File-owned.

## Deferred work

There is no Intelligence persistence or data-topology entry. Versioned business extraction contracts, DocumentType ownership and Contract-first import described by follow-up issues are deferred; this foundation does not claim those capabilities.

## Evidence

Source lives in `packages/intelligence`; canonical ownership and dependency direction live in `architecture/semantic-model.json` and `architecture/implementation-topology.json`. Simulated provider tests verify protocol mapping, bounded failures and processor identity, but do not prove live Gemini availability, extraction accuracy, provider acceptance, production configuration or LINE-device behavior.
