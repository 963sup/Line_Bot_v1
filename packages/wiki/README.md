# Wiki

Repository-scoped versioned knowledge pages. See [owner contract](../../docs/owners/wiki.md), [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json) and [data topology](../../architecture/data-topology.json).

Source responsibilities: Domain page transitions and revision comparison; Application input validation and use cases; Contracts published DTOs and transactional persistence ports; outbound persistence adapters; explicit bootstrap construction.

The package public exports are consumed by the authenticated Web composition. HTTP delivery, Markdown rendering and attachments are outside this package; there is no standalone Wiki CLI.
