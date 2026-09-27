# Owner contracts

These files are the hot-path human contracts for owner-local business rules that are not obvious from code/schema alone.

Load exactly one affected owner file when possible. Heavy owners link to `docs/reference/domains/` for low-frequency lifecycle / command / locator / regulatory detail; do not preload those references.

Current owner kind、lifecycle、capability/status、implementation mapping remain machine-owned by `architecture/semantic-model.json`。Package paths / dependencies remain in `architecture/implementation-topology.json`。

If the owner is unknown, use:

```sh
pnpm semantic explain <concept>
pnpm semantic plan "<intent>"
```
