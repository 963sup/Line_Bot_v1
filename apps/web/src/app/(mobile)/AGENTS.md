# Mobile application route group

`(mobile)` 擁有 authenticated Mobile / LINE MINI App delivery：mobile shell、primary navigation、page composition，以及 direct-entry / refresh / back 的 presentation continuity。它不擁有 business truth、authorization、resource identity、package boundary 或 persistence。

## Invariants

- Route Group 不進 URL，也不授權。
- Navigation state、resource identity、business state 與 authorization state 分開。
- Page/layout 只組合 owner public capability；不複製 use case。
- Direct open、refresh、soft navigation、back 必須收斂到同一 authoritative query/command。
- Home / Explore / Inbox 類 surface 是 composition/presentation vocabulary；不能因 UI 名稱建立同名 Domain/package。
- Canonical resource route、published compatibility route 與 current app-shell 以 [Web runtime](../../../../../docs/020-architecture/050-runtime-architecture.md) 和實際 route source 為準；本檔不維護完整 route inventory。
- Project、Recent、cross-owner feed 或其他尚無 current owner/runtime contract 的能力不得由 localStorage、browser history、fake count 或 disabled shell 冒充。
- Profile / Settings / navigation locator 只使用 owner已驗證 projection；不得從 LINE profile、display name、provider metadata 或 opaque UserId fabricated login/slug。
- Search / discovery 只能宣稱實際 owner contract 支援的 coverage；UI filter 不擴張資料 authority。
- Refresh/retry 不得把同一有副作用 intent 變成第二個 command；unknown result 沿 owner replay/readback contract處理。

## Presentation boundary

AppShell 只擁有所有 mobile destinations 都需要的共用 frame/navigation/accessibility mechanism。Page-specific heading、action、owner query、error/empty state 留在各自 destination/module。

Private data 與 command 必須沿：

```text
trusted proof
→ current Principal / qualification / scope
→ owner query or command
→ authoritative result
```

Browser presentation state 不能跳過任一步。

## Change rules

- 新增／改動 mobile destination 前先確認 owner、current capability、canonical URL、direct-entry/back behavior、loading/empty/forbidden/source-failure/unknown-result。
- 需要 owner之外的資料時，透過最外層 composition 組合 public projections；不讓 feature modules互相 deep import。
- Global navigation 改動同步 app-shell tests、route tests、login/LIFF continuation 與需要的 Rich Menu entry；不在本檔重複 domain invariants。
- 執行適用 browser/test validation；provider/device acceptance 與 repository tests 分開回報。
