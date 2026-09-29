# Mobile presentation target

Status: target design. This file does not describe current runtime completion and must not override source, tests, semantic topology, owner contracts, or nearest AGENTS.md.

## Purpose

Use the vendored GitHub FPT JSON as domain truth for GitHub GraphQL semantics, and use GitHub Mobile only as an interaction and information-architecture benchmark. Preserve Line_Bot_v1 ownership, authorization, identity, replay/version, error, and evidence semantics. Code/SCM capabilities may remain unimplemented, but visual similarity or implementation status never rewrites FPT truth.

## Target principles

- Prefer compact mobile hierarchy: context/header → navigation or filter → list/detail → explicit action.
- Keep resource identity and owner/scope visible. Do not collapse Account, Organization, Enterprise, Team, Repository, Issue, Discussion, Label, Milestone, Attendance, Expense, or Partner into a generic resource model.
- Global tabs, resource sub-navigation, filters, detail state, and command state are different presentation responsibilities.
- Loading, empty, restricted/forbidden, not-found, unavailable, unimplemented, conflict/replay, and unknown-result states remain distinguishable.
- UI visibility, route names, tabs, badges, disabled state, provider sessions, and navigation history never authorize a business operation.
- Current owner contracts define available fields, counts, history, pagination, commands, and write capability. Missing contract data is not fabricated to match a benchmark.
- Navigation state may retain non-sensitive intent only. Account/scope changes, revoke/logout, stale responses, provider callbacks, and private projections must preserve current trust and revalidation rules.
- Shared UI/presentation/browser/server layers remain neutral. They do not gain business authority, cross-owner SQL, generic CRUD, universal authorization, or hidden retry semantics.
- Mobile redesign does not justify GraphQL, a second DTO/schema, a new global state service, a CSS framework, a package, or an abstraction without a real responsibility/consumer.
- LINE Rich Menu remains an entry surface. Web navigation changes do not imply LINE publication; publication keeps its separate revision, authorization, remote mutation, and readback contract.
- Technical telemetry remains privacy-minimized operational evidence and never replaces business audit/history.

## Accessibility and acceptance target

When a mobile slice is implemented, verify the affected surface with representative narrow widths (including 320/390px), wider viewports, text enlargement, keyboard/focus behavior, safe areas where relevant, long Chinese/English locators, direct links, back/return behavior, and the actual loading/error/empty/public/private states supported by that slice.

Actual browser/device screenshots or interaction evidence prove only the observed UI/runtime behavior. Repository validation, provider readback, deployment, and business completion remain separate evidence classes.

## Change rule

Implement only bounded slices backed by current owner contracts. If a target requires a new URL, public contract, data field, command, owner, or authorization rule, treat that as a separate architecture/product change and route it through the repository task/owner model before implementation.
