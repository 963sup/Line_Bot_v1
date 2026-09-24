# Retention and lifecycle

## Principle

每類 business data、原件、衍生資料、cache、audit 與 backup 都要有明確用途與生命週期；「目前沒有清理程式」不等於永久保存，「UI 看不到」也不等於資料已刪除。

## Required decisions

每種資料至少定義：

| Decision | Required meaning |
| --- | --- |
| Purpose / minimum fields | 為何需要保存，是否能以更少資料完成目的 |
| Read authority | 哪個 actor / scope 可以讀取 |
| Retention | 起算點、保存期限、法規／業務理由 |
| Withdrawal / deletion | 主資料、cache、外部副本與衍生資料如何處理 |
| Backup behavior | 到期／撤銷後 backup 如何避免復活已刪除狀態 |
| Recovery | restore 後如何重新套用停權、撤銷、刪除與版本狀態 |
| Failure | 保存／刪除失敗如何明示與安全重試 |

具體期限若尚未定案，放在 `090-governance/040-gaps/`，不要填假數字。

## Historical business evidence

Member identity、ledger、attendance facts、command receipts、audit、version history 等是否可刪除由各 module 與法律／營運需求共同決定。不能因 Auth link 移除、Member 暫停或 UI 功能下架就 cascade 刪除仍需要追溯的 business evidence。

## Sensitive raw data

原始圖片、精確定位、聊天內容與 provider credential 只在有明確 business purpose 時處理；失敗定位、普通未授權圖片或普通聊天不得為了「以後可能有用」而保存或送 AI。

## Derived data

AI draft、cache、projection、export 與 external copy 都是衍生資料，不會因來源仍存在就自動取得永久保存權。Source version / authorization 改變時，舊衍生資料是否可繼續使用要由 owner contract 決定。

Security data boundaries：[Scope and data isolation](../050-security/040-scope-and-data-isolation.md)；backup/recovery：[Recovery](../070-operations/030-recovery.md)。
