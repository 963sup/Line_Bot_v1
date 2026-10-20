# Content package constraints

Inherits the [packages contract](../AGENTS.md). Authority: [Content owner](../../docs/owners/content.md).

- Own only the shared normalization and validation policy for title/body text values.
- Trim titles, require 1 to 200 JavaScript UTF-16 code units, and preserve body strings exactly while limiting them to 262144 code units.
- Do not own identity, revisions, lifecycle, persistence, authorization, HTML, Markdown, or rendering behavior.
- Keep the public surface explicit through `package.json` exports. Do not introduce configurable policy engines or framework ports.
