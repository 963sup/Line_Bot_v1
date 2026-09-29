# Notifications package

Routing and module overview for `@line_bot_v1/notifications`.

- Semantic Owner: `notifications`
- Authority document: [`docs/owners/notifications.md`](../../docs/owners/notifications.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Runtime routing

The current executable slice is recipient-scoped inbox reading and marking a notification read.

- [Notification Aggregate](src/domain/aggregates/notification.ts): first-read timestamp and replay-safe version transition.
- [Use cases](src/application/use-cases/notifications.ts): qualification, input normalization, expected business results and published projection.
- [Published DTO and Result](src/contracts/dto/notification.ts): explicit exchange fields, independent of the Aggregate representation.
- [Repository contract](src/contracts/repositories/notification-repository.ts): recipient scope and atomic mark-read semantics.
- [PostgreSQL adapter](src/adapters/outbound/persistence/postgres-notification-repository.ts): mapping, transaction and row locking.
- [Composition](src/composition/bootstrap/postgres-notification-repository.ts): concrete wiring returning the public Repository contract.
- [HTTP route](../../apps/web/src/app/api/notifications/route.ts): authentication context, origin/body checks and HTTP projection; Request/Response and LINE identity remain in the host.

## Validation routing

[Package tests](test/notifications.test.ts) exercise domain transitions and use cases. [Persistence contract tests](test/postgres-notification-repository.test.ts) check recipient-scoped SQL, row-lock ordering and replay behavior with an injected database; they do not replace real PostgreSQL concurrency acceptance.

[Actual-route tests](../../apps/web/test/notifications-route.test.ts) execute the route with controlled host composition and real Notifications use cases. The separate [HTTP integration regression](../../apps/web/test/notifications-api.test.ts) retains the actual host imports and LINE verification adapter, replacing external fetch and owner operations. Its owner-operation fixture uses the application Result contract, while assertions keep the public JSON unwrapped, authenticated subject forwarding, admission-before-mutation and failure redaction covered.

Run the relevant suites through `pnpm validate --group typecheck-test`, format checks through `pnpm validate --group lint`, and the complete `pnpm validate` merge gate. Delivery attempts and other persisted concepts remain governed by the owner document and data topology; this routing page does not claim an unimplemented dispatch worker or preference capability.
