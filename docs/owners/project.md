# Project

Read this file for Project ownership and invariants.

## Responsibility

Project owns:

- stable Project identity plus an owner-scoped positive `number`;
- root planning lifecycle: create, update, close/reopen, copy and soft delete;
- Project-specific User/Team collaborator grants and effective `READ | WRITE | ADMIN` access;
- ProjectItem identity, ordering, archive lifecycle and content variant;
- Project-owned `DraftIssue` identity/content/assignees until explicit conversion to a real Issue;
- typed Project field definitions, select/iteration options and per-Item typed values;
- persisted Project views and their visible-field configuration;
- Project status updates, independent from Issue state/events;
- replay-safe Project commands, aggregate version and immutable Project event evidence;
- current Project `READ | WRITE | ADMIN` authorization and open/closed/deleted lifecycle decisions consumed by Project-scoped WBS and Actions;
- references to Repository and Issue identities without acquiring either source owner's authority.

Account remains authoritative for User/Organization identity. Organization and Team remain authoritative for their membership/qualification facts. Repository remains authoritative for Repository visibility/access. Issue remains authoritative for Issue content and lifecycle.
WBS remains authoritative for Project-scoped WBS documents, immutable Revisions, governance and Baselines. Actions remains authoritative for fixed Project automation rules and Runs. A shared ProjectId and transaction do not transfer those facts to Project.

## Current runtime

Canonical capability `manage-project-planning` is implemented alongside `read-projects`.

- HTTP management transport: `GET/POST /api/project-management`.
- User lookup transport: `GET /api/project-management/users`. Every lookup first obtains the current authorized Project view; exact-login invite candidates require `ADMIN`, while display-label lookups accept only User IDs already present in that view and return active User login projections.
- Web presentation supports Project creation, settings, Project User/Team grants, Project-local DraftIssue items and a Project-owned single-select progress field. User invite lookup is an exact-login projection and requires current Project `ADMIN`; it never lists arbitrary Users.
- Project creation can import `OPEN`, `CLOSED` or all Issues from one currently readable Repository. Existing Project administrators can configure or disable imports with `set-repository-import`. Importing stores Issue references, never a copy of source content. The first bounded batch commits with creation/configuration and its exact receipt; remaining and future matching Issues are admitted by the Project worker.
- Standing import intent is bound to the configuring administrator's User qualification version. Every background batch rechecks current active qualification, Project `ADMIN`, open lifecycle and Repository access. Revocation disables the intent with a versioned Project event; restoration requires an explicit administrator command. Closing a Project suspends admission. Worker overlap/restart cannot duplicate Items, and explicit removal persists an exclusion so automation cannot recreate a removed Item; a later explicit manual add clears that exclusion.
- The [Project import operation](../../packages/project/src/composition/bootstrap/repository-imports.ts) is owned by the Project package and covered by [repository-import tests](../../packages/project/test/repository-imports.test.ts). Its source projections and metadata remain filtered by each viewer's current Repository access; deployment scheduling is an operations concern, not a Project domain contract.
- Project User label lookup is limited to IDs already visible in the authorized Project snapshot and returns only active User login labels.
- Owner-number lookup: `GET /api/projects/by-number/{projectNumber}?owner={ownerLogin}`.
- Stable ProjectId remains the authoritative identity; owner login and number are locators only.
- Creation allocates a number inside the owner Account scope. Number uniqueness is owner-scoped and independent from mutable title.
- Existing pre-parity rows without a number are adopted explicitly rather than silently reinterpreted.
- User and Team collaborators are Project-owned grants. Current source qualification is rechecked; Project grants do not rewrite Account/Team authority.
- Public Project visibility may grant read projection only. It never grants Project write authority or source Repository/Issue access.
- The public Project content-scope output contract rechecks the current active User, locks the current Project, recomputes direct/Team/public access, returns `READ | WRITE | ADMIN`, and reports closed state. Soft-deleted or unauthorized Projects resolve as not found. It does not read or write WBS/Actions private tables.
- Root writes require Project write/admin policy; collaborator administration and destructive root operations require the stronger management policy enforced by the Project owner runtime.
- Every command carries a stable request UUID. Existing-project mutations require `expectedVersion`; exact replay and stale-version conflicts are handled inside one transaction.
- Close/reopen uses a pure Domain transition coordinated by the Application through a transaction output port. Its existing order is governance lock, actor/request lock, receipt lookup, then current readable scope for replay; a new command locks the Project and checks version, current `ADMIN` and lifecycle in that order. A currently readable former administrator may replay their committed receipt, but cannot issue a new lifecycle command. State, immutable event and receipt commit or roll back together.
- Organization-owned ProjectV2 creation and owner-level management consume Organization's current product-local `viewerCanCreateProjectV2` / `viewerCanAdminister` capability contract. A creator allowed by the member creation capability receives a Project-owned `ADMIN` User grant in the same transaction, so the newly created private Project is immediately usable; an `OrganizationOwner` keeps implicit owner authority and is not copied into Project collaborator grants. The deprecated FPT `viewerCanCreateProjects` field refers to Projects (classic), not this authorization path, and no generic Permission value is created for this path.

## Item and DraftIssue invariants

- `ProjectItem ≠ Issue`. Project owns Item identity/order/archive metadata; an Issue-backed Item only references Issue-owned work.
- Removing or archiving an Item never closes or deletes its source Issue.
- An Item has exactly one adopted content variant: Issue reference or Project-owned DraftIssue. No fake Repository/Issue placeholder is used.
- DraftIssue conversion checks current target Repository create authority, delegates Issue creation to the Issue owner in the same transaction, preserves Project Item identity/planning metadata and then replaces only the content reference.
- Viewer-facing Issue/Repository references recheck current source visibility/access. Hidden source items and field values are omitted rather than leaking titles, counts or metadata.

## Collaborator invariants

- Owner authority, Project collaborator access, Organization membership and public visibility are distinct facts.
- Project User/Team grants use `READ | WRITE | ADMIN`; Team qualification is consumed from the Team owner and never copied as Project membership truth.
- Seeing a Project does not imply access to every referenced Repository or Issue.
- Grant/revoke changes are versioned Project mutations and do not grant Repository/Issue permissions.

## Typed field invariants

- Project fields are Project-only planning fields and are separate from IssueField.
- Adopted data types are `DATE | ITERATION | MULTI_SELECT | NUMBER | SINGLE_SELECT | TEXT`.
- Scalar values use typed columns; MULTI_SELECT uses a separate option relation. Arbitrary JSON/EAV values are not Project field truth.
- Select options and iterations have stable identity inside their field. Field type is not mutated in place.
- Set/clear value validates Item/Field scope and referenced option/iteration identity.
- Deleting a field removes only Project-owned planning values/configuration; it never rewrites source Issue facts.

## View invariants

- ProjectView has stable identity, Project-scoped number, name, layout and explicit visible-field ordering.
- Adopted layouts are `BOARD_LAYOUT | ROADMAP_LAYOUT | TABLE_LAYOUT`.
- A View configures presentation only. It does not create a second Item store, rewrite field values or become an access policy.
- Visible fields must reference fields owned by the same Project.

## Status-update invariants

- ProjectV2StatusUpdate is Project-owned and independent from Issue status/events.
- Current adopted status values are `AT_RISK | COMPLETE | INACTIVE | OFF_TRACK | ON_TRACK`, plus nullable status/date/body where allowed by the contract.
- Create/update/delete-retain operations preserve author, stable identity, timestamps and version.
- Project event evidence may reference status-update mutations but is not a second writable copy of the update body.

## Number / locator invariants

- ProjectId is stable identity. Project number is stable only within the owner Account scope.
- Number allocation is serialized by the Project owner runtime and never shares the Repository Issue/Discussion number sequence.
- Mutable title is presentation, not identity.
- Owner login + Project number resolves the Project and then rechecks current Project access; knowing the URL never authorizes access.

## Project-scoped WBS and Actions

Project supplies the current authorization and lifecycle contract for Project-scoped WBS and fixed Actions. `READ` permits reads only. `WRITE` permits WBS draft edits, proposals and reviews. `ADMIN` is required for publication, policy changes and Project Actions management. A closed Project remains readable to an authorized viewer, permits exact replay of an already committed request, and rejects new writes. A deleted Project is not found.

WBS owns the WBS document head, immutable Revision history, exact-replay receipts, policy, proposals, reviews, Baselines and publication outbox. Actions owns the two fixed automations and their immutable rule versions, accepted events, Runs, attempts and command receipts. Project-local Milestone remains a separate Project planning concept. Neither Project WBS nor Actions reinterprets ProjectItem, Issue hierarchy or Repository Milestone.

## Mapping

Runtime owner: `packages/project`.

Canonical machine truth:
[semantic model](../../architecture/registry.json#domain) ·
[implementation topology](../../architecture/registry.json#modules) ·
[data topology](../../architecture/registry.json#data) ·
[Project root schema](../../packages/integration-supabase/src/schemas/700_projects.sql) ·
[Project Item/Draft schema](../../packages/integration-supabase/src/schemas/701_project_items.sql) ·
[Project WBS schema](../../packages/integration-supabase/src/schemas/702_project_wbs.sql) ·
[Project access schema](../../packages/integration-supabase/src/schemas/705_project_access.sql) ·
[Project field schema](../../packages/integration-supabase/src/schemas/707_project_fields.sql) ·
[Project view schema](../../packages/integration-supabase/src/schemas/708_project_views.sql) ·
[Project status schema](../../packages/integration-supabase/src/schemas/709_project_status_updates.sql) ·
[Project WBS governance](../../packages/integration-supabase/src/schemas/710_project_wbs_governance.sql) ·
[Project WBS outbox](../../packages/integration-supabase/src/schemas/711_project_wbs_outbox.sql) ·
[Project Actions](../../packages/integration-supabase/src/schemas/712_project_actions.sql).

Adjacent owners: [Account](account.md) · [Organization](organization.md) · [Team](team.md) · [Repository](repository.md) · [Issue](issue.md)
