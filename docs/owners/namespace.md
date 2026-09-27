# Namespace

Read this file for the Namespace owner boundary and invariants. Load [detailed reference](../reference/domains/namespace.md) only when the task needs lifecycle / command / locator details.

## Purpose / strategic position

Namespace 是 current policy owner，處理多個 owner 或 runtime surface 共用同一命名空間時的 Scope、Locator、reservation 與 collision semantics。它的 business result 不是「集中管理所有名稱」，而是確保 human-readable locator 在明確 Scope 內可無歧義解析到 stable Subject，同時不把 locator 誤當 identity 或 authorization。

Namespace 不是 universal entity registry，也不因 package 存在就取得 Account、Repository、Team、Enterprise 或 Web route 的 lifecycle / data authority。Domain-local naming若只有單一 owner，就留在該 owner。

## Owns

Namespace owns：

- shared cross-owner Namespace 的 scope / reservation / collision policy；
- stable Subject 與 mutable Locator 必須分離的跨 owner invariant；
- 判斷 naming problem 是 shared namespace 還是 owner-local namespace 的 policy boundary；
- 當多個 owner 或 runtime surface 競爭同一 Key space 時，誰可以 claim / reserve Key 的 canonical policy。

目前第一個 executable shared namespace 是 global root namespace：產品 static root routes 與 Account-owned User / Organization login 競爭同一第一層 locator space。

## Consumes / Consumers

Namespace 本身不取得其他 owner 的 private model。Current consumer：

- Account：先依 Account 規則 normalize login，再呼叫 Namespace root reservation contract；Account仍擁有 login persistence / rename / lifecycle。
- Web delivery：actual static root route inventory 是 namespace participant evidence；Web 不取得 Namespace policy authority。

Repository、Team、Enterprise 的 owner-local naming目前不依賴 Namespace runtime contract，因為它們各自已有單一 authority，沒有跨 owner collision responsibility。

## Does Not Own

Namespace does not own：

- User、Organization、Enterprise、Repository、Team 的 stable identity 或 lifecycle；
- Account login format、normalization、persistence、rename lifecycle、profile 或 qualification；
- Repository name normalization、rename、visibility、access 或 Repository lifecycle；
- Team slug generation / rename；
- Enterprise slug 或 EnterpriseTeam slug policy；
- Issue / Repository Milestone number allocation；
- Label name semantics；
- Next.js route implementation、navigation 或 deployment；
- authentication、authorization、membership、permission；
- generic `namespaces` table、cache、second store 或 universal registry。

相同「需要唯一」不等於相同 responsibility。只有 shared Scope / collision authority 真正跨 owner 時，才進 Namespace。

## Business invariants

1. **Stable identity ≠ Locator**：rename / route change 不得建立新的 stable Subject，也不得用 Locator 取代 stable ID。
2. **Uniqueness is scoped**：Key 只在 declared Scope 內比較 uniqueness；不同獨立 Scope 可合法出現相同字串。
3. **Shared namespace cannot double-claim**：同一 shared Scope 的同一 normalized Key 不得同時被兩個 Subject，或 Subject 與 Reserved Key claim。
4. **Reservation ≠ authorization**：平台保留 Key 只避免 locator collision，不授予 business access。
5. **Resolve ≠ qualification**：成功解析 Locator 只得到 Subject；current qualification / permission 仍由真正 owner 重新驗證。
6. **Owner-local policy stays local**：格式、normalize、slug derivation、rename、number allocation若只有單一 Domain authority，就不得搬到 Namespace 形成 horizontal God Module。
7. **One policy truth**：shared root reservation 的 machine Source of Truth 是 `packages/namespace/src/root.ts`；Account code直接消費，SQL / route checks只能 enforce / verify。
