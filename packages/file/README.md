# File

Protected original File versions. File's workflow is **Upload → immutable source revision → authorized source read**. Intelligence may use that exact source to create an explicit ProcessingRun; File neither selects processors nor persists processing results. No automatic downstream business import occurs.

See the [owner contract](../../docs/owners/file.md), [local constraints](AGENTS.md), [generated semantics](SEMANTICS.md) and [authenticated CLI](../../scripts/operations/file/README.md).
