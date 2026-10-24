## Business result / Root cause

<!-- 說明使用者可觀察的結果；Bug／架構修正請沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger，附 current SHA、source／test／log。純 docs／例行維護可填「不適用」與理由。不要將假設或歷史證據當成已確認根因。 -->

- Related Issue / current evidence：
- Root cause（或尚待確認事項）：
- Authoritative Owner / Source of Truth：
- 為何修正這個來源，而非 symptom patch：

## Implementation / complexity decision

<!-- 高內聚：一項責任由唯一 Owner 承擔。低耦合：consumer 僅使用必要 public contract，依賴方向正確。保持 DDD + Hexagonal 的 Domain 決策、Application 協調、Port 能力及 Adapter mechanism；不為目錄對稱增加空層。 -->

- Correct change / existing capability reused：
- Necessary added complexity（新增 abstraction、dependency、writer／store、compatibility layer 的實際責任；無則填「無」）：
- Removed duplication / accidental complexity（無則填「無」）：
- Modern solution evidence（與實際安裝版本、current repository 成功 pattern 或適用官方契約對照；不以「最新」作充分理由）：

<!-- 最小充分實作 ≠ 最少修改檔案／最短 diff。根因、Owner、Truth、Boundary 確認後才使用奧卡姆剃刀。保留授權、隔離、原子性、版本、replay、recovery 與 audit；不新增無責任的 wrapper／facade／alias／fallback。 -->

## Boundary impact

<!-- 只填真實受影響的邊界；無影響填「無」。不要用 package／folder 名稱取代語意與 data boundary。 -->

- GitHub FPT domain truth（exact file/symbol/field；vendored 變動需 pinned revision）：
- Line_Bot_v1 Domain / Bounded Context overlay：
- Module / public contract / dependency direction：
- Data / consistency / transaction / isolation：
- External integration / provider：

## Validation / evidence

<!-- 列實際執行的指令、commit SHA、結果與尚未驗證事項；依 docs/rules/validation-evidence.md，不在 template 建立第二套規則。Mock、native PostgreSQL、CI、部署、provider readback、Browser／LINE 真機不可互相冒充。 -->

- Root-cause regression / negative cases：
- Preserved invariants / rollback / concurrency evidence：
- Commands and results：
- Remaining validation / release evidence：

## Commit 結構

<!-- 依 docs/reference/engineering/development-workflow.md 收斂 WIP／fixup history；說明 squash 或需保留的獨立 logical commits。 -->

## 風險或待辦

<!-- 沒有則填「無」；未確認的 Root Cause／provider 或產品政策須明示。 -->
