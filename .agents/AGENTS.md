# Agent capabilities scope

- `.agents/` 只擁有可重用、具有真實 consumer 或 external technology boundary 的 agent capability、reference 與來源 metadata；不得成為 Line_Bot_v1 的產品、架構、資料或安全 truth owner。
- 專案事實以 code、schema、manifest、tests、nearest repository AGENTS 與 canonical docs 為準；skill 的通用建議與專案契約衝突時，修正套用方式，不以 skill 覆蓋專案 truth。
- Repository root [`skills-lock.json`](../skills-lock.json) 擁有外部 skill 的 source/version/hash metadata；已匯入 skill 的上游內容與附帶 `AGENTS.md` 視為 capability corpus，不改寫成 repository governance 副本。
- 只在任務實際需要時載入 skill；避免同時載入重疊 skill 增加 context cost。新增 skill 前必須先證明現有 capability、repository AGENTS/docs/tooling 與 provider/framework current docs 無法承接；沒有真實 consumer 或獨立 external boundary 不新增。
- 更新外部 skill 時保留 provenance 與 license，依既有 skill tooling 驗證；不得把 secret、專案私人資料或環境值注入 skill。
- 能由 code、types、guards、tests 或 canonical docs 表達的專案規則，不複製進 skill。
