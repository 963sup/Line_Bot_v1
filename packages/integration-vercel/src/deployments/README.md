# Deployments

本入口整理 build、Preview、Production 與 recovery 的位置；未新增部署流程。Canonical authority：[Vercel](../../../../docs/reference/platform/README.md#vercel)、[Release](../../../../docs/reference/operations/release.md)。

- Build configuration 留在 [Web manifest](../../../../apps/web/package.json)、[next.config.ts](../../../../apps/web/next.config.ts) 與 [vercel.json](../../../../apps/web/vercel.json)。
- Preview branch routing 以 `vercel.json` 的實際 Git 設定為準；不是任意非 main push 都會建立 Preview。
- Production 沿用 `scripts/providers/vercel/deploy-production.mjs` 與 current-main Release，不建立第二份 CLI／workflow。
- Deployment READY、exact SHA、Production target 與 alias 各自讀回；未知 mutation 結果先 reconciliation。
- Recovery 先核對 runtime 與 schema 相容性，沿既有 [Recovery](../../../../docs/reference/operations/recovery.md) 處理，不把 alias 切回等同資料回復。

後續驗收入口：[Tests](../tests/README.md)。
