# Google REST API adapters

`@line-work/google-workspace` 直接用 server `fetch` 呼叫核定的 Google 官方 API，不使用 Firebase、不提供任意 URL proxy。`src/adapters/request.ts` 是 package-private HTTP/pagination/timeout mechanism；各公開服務由 package.json 明確 export。

| 服務 | 公開函式 | 限制 |
| --- | --- | --- |
| Calendar | readCalendarEvents | 指定期間、展開重複事件、保留取消與全天事件 |
| Tasks | listTaskLists、listTasks、createTask、setTaskStatus | 個人任務，不是內部 Task source of truth |
| Forms | getForm、listFormResponses、createForm、updateForm | batchUpdate 採官方 request 結構；填寫走原生表單 |
| Drive | listFiles、getFile、trashFile | 中繼資料與回收桶，無永久刪除或內容上下載 |
| Keep | listNotes、getNote、createNote | 依 Google enterprise access 條件 |
| Gmail | listMessages、getMessage、sendMessage | 保留 MIME tree；寄送輸入為 base64url MIME |
| Docs | getDocument、createDocument、updateDocument | 保留 tabs；batchUpdate 可帶 writeControl |
| Sheets | getSpreadsheet、createSpreadsheet、readSheetValues、appendSheetValues | A1 range；預設 RAW |
| Maps | geocodeAddress | 獨立 server API key；地址解析不是定位證明 |

使用 owning public surface，例如：

```ts
import { listTasks } from "@line-work/google-workspace/adapters/tasks";
```

Access token、Google account/resource、scope 與 business authorization 由呼叫 use case 驗證。Adapters 不保存 token、不快取私人回應、不自動 retry side-effect writes。寫入逾時可能已在 provider 成功，呼叫端必須先 reconciliation。

Canonical integration contract：`docs/030-platform/050-google-workspace.md`。離線 adapter tests 位於 `packages/google-workspace/test/`；真實 OAuth/account/配額驗證另行記錄，不由離線測試推定。
