# Resources

This package owns two explicit models during the staged cutover:

- New physical Resources: immutable `LOCATION | EQUIPMENT | MATERIAL` kind, versioned
  name/description, archive/unarchive lifecycle and an exact public revision reader used by Content
  and Execution.
- Legacy Objects: Object Types, versioned content/quantities, directed relationships, existing HTTP
  and Issue reference contracts. These remain current writers and historical authority until an
  explicit classification and migration policy is decided.

No name, Object Type, relationship or unit is used to infer physical identity. Consumers use public
reference readers and never query Resource-owned relations.

Read the [owner contract](../../docs/owners/resources.md), [local constraints](AGENTS.md) and generated
[semantics](SEMANTICS.md) for the current responsibility and published Object wire contract.
