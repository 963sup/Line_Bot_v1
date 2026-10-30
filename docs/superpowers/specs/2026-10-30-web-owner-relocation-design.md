# Web owner relocation design

## Intent

Reduce coupling and accidental business orchestration in `apps/web` by moving
confirmed business behavior to its existing package owner. Preserve the Web
application as the delivery boundary for routes, HTTP transport, composition,
browser state, and presentation.

The first scope is repository-facing Web capabilities. This is a controlled,
incremental program, not a directory-wide move or an attempt to make Web and
package layouts symmetrical.

## Goals

- Establish semantic evidence for each proposed relocation with Serena v2 LSP:
  entry point, definition, references, owner, public export, and dynamic or
  external consumer check.
- Move only behavior that belongs to an existing owner and has a minimal public
  capability for Web to consume.
- Remove confirmed duplicate Web business logic and its now-unused imports,
  exports, tests, and composition wiring in the same bounded change.
- Retain existing URLs, request identity, authorization, tenant isolation,
  expected-version checks, idempotency, recovery, and observable API behavior.

## Non-goals

- Do not create new packages, generic service layers, facades, or shared
  business abstractions.
- Do not move Next.js delivery, request parsing, origin/content-type checks,
  response projection, browser state, UI interaction, or route composition
  merely because they are near a business capability.
- Do not use an empty reference result as proof that a consumer does not exist.
- Do not refactor unrelated owners in the same change.

## Current evidence

- `apps/web` is the application host and has no semantic owner; its allowed
  package dependencies include `@line_bot_v1/repository` and related owners.
- Serena v2 indexed 1,529 TypeScript files and its LSP health check passed,
  including symbol lookup and cross-file reference lookup.
- `@line_bot_v1/repository` already exposes public application capabilities for
  access, address, management, creation, resources, subscriptions, stars,
  collections, and overview.
- The Web repository modules contain repeated HTTP adapters. For example,
  access, address, and management each validate query parameters, recover the
  request identity, call an owner capability, and project a response. These
  are delivery concerns and are not relocation candidates by themselves.

## Approaches considered

1. Move all repository-named Web modules together. Rejected because those
   modules include delivery and UI responsibilities as well as work owned by
   Repository, WBS, Wiki, Insights, Content, and other packages.
2. First consolidate Web HTTP adapters into a generic abstraction. Rejected as
   a first step because it changes delivery design without demonstrating a
   business-owner boundary violation.
3. Inspect one complete capability at a time, then move only confirmed
   business logic to its existing owner. Selected because it gives each change
   a bounded consumer and validation surface.

## Method

For each capability, use Serena v2 LSP in this order:

1. Locate the route or UI entry point and obtain its symbols.
2. Trace definitions, implementations, and references through Web modules,
   API composition, package public exports, and the owner implementation.
3. Use bounded text search only for dynamic strings, route names, and framework
   consumers that LSP cannot resolve.
4. Classify the result as `keep-web`, `relocate`, `merge`, `needs-api`, or
   `evidence-insufficient`.
5. Implement only a high-confidence `relocate`, `merge`, or parent-approved
   `needs-api` result. Keep the change to one complete capability.
6. Re-run affected symbol references and diagnostics, then the owner and Web
   checks justified by the changed contract.

## First discovery batch

Inspect Repository access, address, management, and creation flows together
only to establish their boundaries:

- Web routes under `apps/web/src/app/api/repository-{access,address,management}`,
  `apps/web/src/app/api/repositories`, and
  `apps/web/src/app/api/repositories/owners`.
- Web adapters under `apps/web/src/modules/repository/*-http.server.ts`.
- Web composition under `apps/web/src/app/api/_composition/repository-*.server.ts`.
- Repository public application exports, use cases, contracts, persistence
  bootstrap, and their direct tests.

This batch does not presume that any named Web file will move. Its output is a
small candidate inventory with the required evidence and one recommended
implementation slice, or an explicit finding that none is safe.

## Implementation sequence

1. Complete the first discovery batch and select one high-confidence slice.
2. Revalidate its LSP definition/reference chain against the current revision.
3. Add the smallest owner public API only when the owner has the behavior but
   lacks a suitable Web-facing capability.
4. Move or merge the confirmed behavior, update its consumers, then remove
   only confirmed obsolete Web code.
5. Run scoped format, type, test, dependency, and repository checks based on
   the files and public contracts changed.
6. Repeat with the next capability only after the current slice is clean.

## Acceptance criteria

- Every change identifies the owner, entry point, consumers, public API, and
  semantic references before and after the change.
- Web retains delivery and presentation responsibilities; owner packages retain
  business authority and do not depend on Next.js or browser code.
- No external package deep-imports owner private source.
- Existing behavior and relevant authorization, version, replay, and recovery
  tests pass.
- Dependency Cruiser, TypeScript, and affected tests show no new boundary or
  consumer regressions.

## Open implementation decision

The first actual relocation depends on the discovery result. If access,
address, management, and creation are all correctly separated already, the
next batch will inspect a repository-adjacent flow that currently contains
business orchestration rather than forcing a low-value move.
