# @line-work/namespace

`@line-work/namespace` owns shared cross-owner naming and locator collision policy.

- Public contract: `@line-work/namespace/root`
- Current source: [`src/root.ts`](src/root.ts)
- Canonical semantics: [Namespace](../../docs/010-domain-owners/190-namespace.md)
- Cross-context vocabulary: [Glossary](../../docs/000-core/050-glossary.md)
- Local change constraints: [AGENTS.md](AGENTS.md)
- Parent package rules: [../AGENTS.md](../AGENTS.md)
- Semantic owner / scoped locator registry: [semantic model](../../architecture/semantic-model.json)
- Cross-owner namespace closure evidence: [`test/scoped-locators.test.ts`](test/scoped-locators.test.ts)
- Module mapping: [implementation topology](../../architecture/implementation-topology.json)
- GitHub structural benchmark: [GitHub GraphQL FPT benchmark](../../docs/000-core/080-github-graphql-fpt-benchmark.md)

The executable slice stays deliberately narrow: global root reserved-key policy shared by Web routing and Account login. User and Organization therefore connect through Account. Enterprise, Organization Team, Enterprise Team, Repository, Issue, Discussion and Repository Milestone participate through scoped locators owned by their Domains; Repository Label name is a Repository-local scoped key without a current detail locator; they do not gain a direct Namespace dependency merely for having a locator. This package has no dedicated persistence boundary.
