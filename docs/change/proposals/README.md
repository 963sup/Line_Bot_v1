# Request for Comments（RFC）

本目錄是尚未採用的設計提案入口。RFC 用來釐清一個有真實 consumer、activation 問題或未決取捨的未來方向；它不是 current product、architecture、schema 或 authorization truth。

當提案被採用且仍有未來決策價值時，將理由與取捨蒸餾到 `../decisions/` 的 ADR。當能力實際落地時，durable truth 必須移至對應的 Owner contract、`architecture/*.json`、schema、source 與 tests；過時提案應刪除而非保留平行規格。

## 建議內容

每份 RFC 以描述性檔名命名，並說明：

1. 問題、真實 consumer 與預期結果。
2. 提案、非目標及受影響的 Owner／契約。
3. authorization、isolation、concurrency、replay、recovery 等不可弱化的 invariant。
4. 已考慮但未採用的替代方案。
5. 最小驗證、採用條件，以及採用後應移入的 canonical truth。

不使用流水號建立第二套歷史排序；Git history 保存時間順序。

## 目前提案

- [Domain target](domain-target.md)
- [Data target](data-target.md)
- [Security target](security-target.md)
- [Mobile presentation target](mobile-presentation-target.md)
