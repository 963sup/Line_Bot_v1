# Project Web Surface

`ProjectList`, `ProjectCreate` and `ProjectDetail` own the Web presentation for `/projects`, `/projects/new` and `/projects/[projectId]`. Project identity in the URL locates a resource; `@line_bot_v1/project` rechecks current access on every read and command.

## Ownership and boundaries

- `@line_bot_v1/project` owns Project lifecycle, User/Team collaborator grants, DraftIssue items, typed fields and values, version checks, replay and persistence.
- The Web module owns the form and list presentation plus calls to the existing Project owner API. It does not create a second writer or infer authorization from navigation state.
- Project User lookup is an exact-login Account projection scoped by current Project access. Invitation lookup requires current Project `ADMIN`; the eventual collaborator command rechecks the target User and Project role.
- Project User labels resolve only IDs already present as the current actor, Project User collaborators, creator or visible DraftIssue assignees. Do not expose a general User directory.
- Project task progress is a Project-owned single-select field. Changing an Item field, archiving an Item or removing a Project Item never mutates its source Issue.
- DraftIssue content remains local to the Project until the Project owner explicitly converts it through the existing conversion command.
- Store an exact pending command only for retry/recovery; submit the same request ID after an unknown result and read back the authoritative Project view after success.

Current transport map: [Web runtime routes](../../../../../docs/reference/runtime/routes.md). Package and data authority: [Project owner](../../../../../docs/owners/project.md).
