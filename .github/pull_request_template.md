## Business result / Issue trace

<!-- 附 Issue # 與本 PR 涵蓋的 acceptance subset。無 Issue 時交代獨立結果。 -->
- Related Issue(s) / covered acceptance：
- Expected vs actual / current source evidence：
- Issue closure：只有 Merge 就完成整張 Issue Acceptance 才用 `Closes #N` / `Fixes #N`；若仍需 Release／Provider／Device 驗收，用 `Refs #N` 並指定後續 Owner。

## Root Cause / Correct change

<!-- Bug／Architecture 沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger；未證明標 Unknown，Feature／純 docs 可填不適用。 -->
- Root cause and evidence：
- Authoritative Owner / Source of Truth：
- Correct source-level change / existing capabilities reused：
- Why this resolves cause rather than symptom：

## Semantic discovery / truth synchronization

<!-- Owner unknown、語意歧義或跨 Owner 影響時，附實際讀取的 authority 與 consumer evidence。Serena／rg 只作程式事實查證，不取代 authority。 -->
- Intent → Owner / Contract / Consumer evidence：
- Symbol / public-consumer evidence：
- Semantic model / Owner contract / relationship synchronization decision（changed / not needed，以及原因）：

## Cohesion / Coupling / Complexity

<!-- DDD + Hexagonal：Domain 決策、Application 協調、consumer Port、technical Adapter。最小充分實作不等於最短 diff。 -->
- Public contract / dependency direction：
- Necessary new abstraction / store / dependency and reason（無則填「無」）：
- Removed duplication / dead code / accidental complexity（無則填「無」）：
- Modern solution evidence（實際版本／已驗證 pattern，簡單修改可填不適用）：

## Boundary impact

<!-- 只列實際受影響的邊界，無則填「無」。 -->
- GitHub FPT domain truth（exact file/symbol/field；vendor 改動附 pinned revision）：
- Line_Bot_v1 Domain / Bounded Context overlay：
- Module / public contract：
- Data / consistency / transaction / isolation：
- External integration / provider：

## Validation / remaining acceptance

<!-- 依 docs/rules/validation-evidence.md 回報實際命令、SHA 與結果；Mock/native DB/CI/Deployment/Provider/LINE device 不互相冒充。 -->
- Regression / negative / replay / rollback evidence：
- Executed checks and exact SHA：
- Unverified cases / post-merge Owner / required Release acceptance：

## Commit 結構

<!-- 依 docs/reference/engineering/development-workflow.md 收斂 branch history。 -->

## 風險或待辦

<!-- 沒有則填「無」。 -->
