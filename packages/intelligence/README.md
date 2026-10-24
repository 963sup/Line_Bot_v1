# Intelligence

`@line_bot_v1/intelligence` is the provider-specific document-understanding integration owned by the [Intelligence owner](../../docs/owners/intelligence.md). Its module kind is `integration-adapter`; it is not a business Bounded Context and owns no persistence or durable business facts.

The current public Composition Entry creates the Gemini-backed implementation of File's public `FileProcessor` contract. File authorizes and reads the exact source, validates returned output and owns the full ProcessingRun lifecycle. CLI and Web hosts import both packages and inject the configured processor; File never imports Intelligence.

Current scope is bounded PDF/JPEG/PNG/WebP extraction into source-located candidate observations with processor identity `observations-v1:<model>`. Output remains untrusted, and no automatic retry, fallback, Save or downstream import is performed.

See [package constraints](AGENTS.md), [semantic model](../../architecture/semantic-model.json) and [implementation topology](../../architecture/implementation-topology.json).
