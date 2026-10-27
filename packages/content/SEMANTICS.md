# Content 基本術語

- `ContentPlanRevision`：工作計畫的版本資料。
- 計畫包含工作結構、計畫數量與必要的來源引用。
- 定義見 [plan](./src/domain/plan.ts)，操作見 [plans](./src/application/use-cases/plans.ts)。

公開能力以 [manifest](./package.json) 的 exports 為準；資料定義與行為以 source／tests 為準。
