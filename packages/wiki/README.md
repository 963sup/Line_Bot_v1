# Wiki

Repository-scoped versioned knowledge pages. See [owner contract](../../docs/owners/wiki.md), [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json) and [data topology](../../architecture/data-topology.json).

Source responsibilities: Domain page transitions and revision comparison; Application input validation and use cases; Contracts published DTOs and transactional persistence ports; outbound persistence adapters; explicit bootstrap construction.

The internal `pnpm wiki:run` command consumes package public exports. Build the workspace first. It reads one JSON object from stdin containing `proof`, `operation`, and the command/query inputs. Never place proofs in argv or saved examples. Operations are `list`, `read`, `history`, `compare`, and `execute`; results are JSON. HTTP delivery, Markdown rendering and attachments are outside this package.
