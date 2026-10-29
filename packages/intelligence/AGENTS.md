# Intelligence scope

繼承 [packages 約束](../AGENTS.md)。

變更解析或重試時，驗證同一 request 的 provider 呼叫次數，以及未知結果的恢復行為。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。

## Intelligence observation authority

- Intelligence may read exactly one authorized File revision and store its own technical attempt/result. Provider or AI output remains untrusted observation, never a confirmed Contract or a File revision.
- Keep File ID/revision/hash, attempt/request identity, provider/model evidence and durable result identity. Unknown provider outcomes, retries and replays must not create parallel business writes or silently re-run completed stages.
- Intelligence must not write Contract, Content or WBS private tables. A Contract candidate is created only through Contract's public validation/command path.
