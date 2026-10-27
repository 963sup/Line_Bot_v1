# Intelligence scope

繼承 [packages 約束](../AGENTS.md)。

變更解析或重試時，驗證同一 request 的 provider 呼叫次數，以及未知結果的恢復行為。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。
