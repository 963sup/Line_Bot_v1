# Content

Content owns Repository-scoped work definitions and plan versions: Subject → Object → SubObject →
Work → Task. Nodes have stable identity, text, ordering and one valid parent. Subjects are roots;
Tasks are leaves. Planned quantities and immutable measure definitions belong to Content.
A measure carries a user-defined unit label (up to 32 UTF-16 code units), not a global Unit
registry or conversion rate. Labels are immutable once saved and cannot imply physical Resource
identity. Existing `pcs` quantities remain integers; other units accept exact decimals up to
three places. Contract agreed and Execution actual quantities reuse the pinned Content measure
without silently converting units.

A user may explicitly import one retained observation from a File-owned SAVED ProcessingRun into
an existing Content plan. The user must choose an existing legal SubObject/Work parent, supply the
new Work/Task meaning, measure and quantity, and confirm that protected File evidence may become
Content-readable plan data. Content requalifies the exact File processing revision and observation
under current File authorization **inside the same Content transaction** before appending the node,
head revision and receipt. This is not automatic extraction, a Contract or WBS write. The immutable
Content revision records the File ID/revisions, SHA-256 and observation mapping only as a private
audit pin; general Content DTOs do not disclose private File source IDs. The File owner retains
the original observation and its uncertainty/source locator. Existing manual plans and historical
revisions remain unchanged.

One Repository plan head selects a complete immutable document revision. Replacing the document
validates the entire hierarchy under its observed version and appends a revision. Historical plans
remain unchanged. A plan version does not imply formal approval, completion or legal effectiveness;
no additional Baseline workflow is inferred.

Resources owns physical Location, Equipment and Material identity/lifecycle. Content validates new
exact resource revision pins through its public transaction-bound reader. Resource archive does not
rewrite history or invalidate unchanged historical pins. Contract owns formal commitments against
exact Work/Task plan items; Execution owns Task execution, prerequisites, actuals and internal review.
Planned, agreed and actual quantities are distinct facts. Task hierarchy is not an execution DAG.

Repository owns current access and archive policy. Permission checks precede replay; new writes
reject archived Repositories, while currently authorized exact replay may return its committed
revision. Expected version, head, revision, pins and receipt commit or roll back together. Changed
payloads under the same request identity conflict. Revisions and receipts are insert/read-only.

Project WBS remains a distinct Project-scoped planning/governance owner. Content does not edit WBS
documents or implicitly transfer their authority. Text validation uses the neutral
`@line_bot_v1/platform/text` export. Physical Resource kind is explicit; names and units never infer
physical resource identity.

Current implementation, dependencies and persisted mappings are recorded by the canonical
[semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json)
and [data topology](../../architecture/data-topology.json).
