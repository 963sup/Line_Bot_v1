# File Web presentation

Inherits [Web modules](../AGENTS.md). This feature consumes the [File owner](../../../../../docs/owners/file.md); it never owns File facts or direct Storage credentials.

- Resolve owner/name only as a locator, then use verified LINE session plus Repository current authorization. File owner independently rechecks every File read, transition and replay.
- Web multipart Upload/Download are capped to 3 MB; File owner and protected CLI may support larger objects. Never assume the host transport supports 45 MiB.
- Select one actual configured Parser or AI processor explicitly; absence of OCR/Excel/Word support is visible, not a fallback. Opening a File or listing Runs never starts a provider.
- Browser Preview edits stay local until a version-bound Save. Pending retries keep the same request identity and do not silently create a second mutation. After private UI state is cleared, only an actor-scoped File-owned Pending Upload query can recover an unknown upload; original bytes must be reselected and the existing fingerprint checked server-side. A historical Run retry is bound to its original FileRevision and Processor version.
- Clear protected File descriptions, drafts and Runs on identity loss, Repository switch, background/pagehide and revoked authorization. Stale responses cannot reinstate data.
- The UI renders processor outputs as escaped text and does not insert source/provider content into URLs or logs. No target domain imports.
