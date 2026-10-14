# Actions internal runtime
Build workspace dependencies first. `pnpm actions:run` accepts stdin JSON with a verified LINE `proof` and `operation`: `execute` plus `command`, `rules` plus `repositoryId`, or `run` plus `repositoryId/id`. Commands use `define / execute / retry / cancel`, `requestId`, `expectedVersion` and Repository scope. Never place proof in argv, logs or committed files.

`pnpm actions:worker` accepts `{"limit":20}` on stdin, processes at most that many event claims/run steps and exits with a structured count. It is an operator process using the existing restricted database runtime identity; it accepts no user/role override. Run it only against the intended environment. There is no scheduler or daemon.

Uses existing `APP_ORIGIN` for the HTTPS `/notifications` link and `LINE_CHANNEL_ACCESS_TOKEN` for delivery. Missing LINE configuration reports unavailable independently of Inbox creation. See [Actions contract](../../docs/owners/actions.md). Production activation and real-recipient testing are separate operator actions.
