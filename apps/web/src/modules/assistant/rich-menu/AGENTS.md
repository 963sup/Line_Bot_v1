# Web Rich Menu module

## GitHub Mobile 目標（後續實作）

- Rich Menu 是進入既有手機工作流程的入口，目標 URL 跟隨 app 契約；不要求把 Web 四個主 tab 生硬塞成同一張選單。
- Web tab 排序改變不等於 LINE menu 必須發布。涉及 URI、圖片或 alias/default/per-user binding 時，另依完整發布授權、來源 revision 與 readback 流程。
- 選單視覺／Web 布局／正式遠端綁定分開驗收；FPT 不提供 LINE 選單規格。

## 現行 surface 與 invariant

URL consumer：既有 definition/entry intent 連到 app 正式入口；本目錄不擁有新 Web URL。調整時核對 [App URL 契約](../../../app/AGENTS.md)、LIFF allowlist、login continuation、發布來源 revision 與遠端綁定 readback。

FPT 不定義 LINE Rich Menu；資源語意可對照，發布行為依 LINE channel 與本地 release 契約。不要把文件更新、Git push 或圖片存在當成已發布／實機驗收。

- Owns product menu definition, desired state, publication policy and operator-facing evidence; LINE channel owns only protocol/client behavior.
- Preview is repository-only and read-only. Publish requires exact source revision, preflight, explicit authorization, remote mutation and readback.
- Menu visibility/navigation never authorizes business operations and must not claim mobile/device acceptance without separate evidence.
