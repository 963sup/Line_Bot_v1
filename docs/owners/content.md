# Content

Content owns Repository-scoped work definitions and plan versions: Subject → Object → SubObject →
Work → Task. Nodes have stable identity, text, ordering and one valid parent. Subjects are roots;
Tasks are leaves. Planned quantities and immutable measure definitions belong to Content.

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
documents or implicitly transfer their authority. A user may explicitly inspect one exact File
SavedResult through File's separately authorized Web read and prefill a browser-local Content node
draft. This does not infer hierarchy or quantity, start a File processor, record formal File→Content
lineage or write to another owner. An authoritative Content revision exists only after the user
invokes Content's version/replay-protected command; machine-verifiable import provenance is still
unimplemented. Text validation uses the neutral
`@line_bot_v1/platform/text` export. Physical Resource kind is explicit; names and units never infer
physical resource identity.

Current implementation, dependencies and persisted mappings are recorded by the canonical
[semantic model](../../architecture/semantic-model.json), [module topology](../../architecture/implementation-topology.json)
and [data topology](../../architecture/data-topology.json).
