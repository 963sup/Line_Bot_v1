# LINE operator scripts

- `pnpm line:rich-menu` is the canonical operation entry. `rich-menu/sync.ts` adapts env/argv/output to the existing Web Rich Menu publisher; protocol/client stay in `@line_bot_v1/line-channel`.
- Assets live in `assets/line/rich-menu/`. Image, definition and executable publication-code changes trigger one publication after validated current-main; documentation/tests alone do not.
- Rich Menu contains only the attendance-in/out pair; `all` publishes exactly those two assets and definitions. Removed submenu names are not valid CLI targets.
- Publish is independent of Supabase and Vercel. No duplicate publication jobs or general Web-change gate.
- `preview` is local; `preflight` reads LINE; `publish` performs preflight/create/upload/activate/readback in one process. Remote writes require exact target and current-main authorization; general check/validate does not publish.
- Publication does not read business state. Per-user menu binding stays with its product owner.
- Stage and permanent URL come from the existing source, not branch/Vercel inference. Keep secret values and remote IDs out of source; no local receipt becomes authority.
- Update affected Release wiring, canonical LINE docs, tests and scripts index with changes. Keep provider readback separate from device acceptance.
