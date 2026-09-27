# Hexagonal architecture

DDD Strategic Design 先由 [Domain map](../000-core/020-domain-map.md) 與 [Repository map](../000-core/030-repository-map.md) 確定 Language、Owner、Boundary、Relationship 與 Invariant；Hexagonal Architecture 只負責在既定責任內維持 dependency direction，不替系統發明新的 Bounded Context。

```text
Business Reality
↓
Owner / Boundary / Invariant
↓
Application capability
↓
Port / Contract
↑
Adapter
```

## Responsibility model

| Layer | Owns | Must not own |
| --- | --- | --- |
| Domain | business truth、state transition、invariant | HTTP、SDK、database、token parsing |
| Application | use-case orchestration、transaction intent、需要的 capability | provider protocol、重寫 Domain rule |
| Port / Contract | consumer 真正需要的 capability / narrow data contract | infrastructure API wrapper |
| Adapter | SQL、SDK、HTTP、runtime implementation / translation | business authorization 或 lifecycle decision |
| Web | URL、delivery、layout、browser interaction、composition | second Domain/Application |
| Agent | extraction / draft / assistive inference | authoritative business write / authorization |

Layering 是責任與依賴方向，不是目錄 quota。沒有真實責任就不建立空 `domain/`、`application/`、`contracts/`、`adapters/`。

## Port decision

```text
Port
= consumer/application 真正需要的能力

不是
= provider SDK / database client 的重新命名
```

新增 abstraction 至少要有一項真實理由：

- consumer-specific capability boundary；
- external technology / trust boundary；
- 真實第二 implementation / variation；
- transaction、recovery、isolation 或 policy responsibility。

只有 forwarding 的 Service / Manager / Facade / Wrapper 應回頭檢查 owner 或 dependency root cause。

## Placement test

| 問題 | Default |
| --- | --- |
| 拿掉 HTTP / DB / SDK 後仍必須成立？ | Domain |
| 協調 use case、順序、transaction intent？ | Application |
| 把 capability 轉成 SQL / SDK / provider protocol？ | Adapter |
| 跨 boundary 只需 stable data contract？ | Contract |
| AI output 仍需 deterministic validation？ | Agent |
| URL / browser / layout / concrete dependency composition？ | Web |

同一 function 同時命中多列時，先拆 responsibility；不要用 `utils` / `service` / `manager` 隱藏混合責任。

## Cross-owner integration

Consumer 只能使用 owner public contract；不得 deep import、讀其他 owner table/private schema 或共享巨大 aggregate。

優先順序依需求：

```text
Stable ID / reference
→ current decision Query
→ owner behavior Command
→ committed fact Event
→ Projection for read
→ ACL / translation when upstream model would pollute local language
```

Event 只有真實 asynchronous consumer / recovery value 時建立；Port 不因「未來可能換 provider」提前存在。

## Transaction / recovery

Authorization、version、replay protection 與需要共同成立的 authoritative effects 不得因技術分層被拆散語意。Application 表達原子 use case intent，Adapter 使用資料庫能力完成；長時間 external API 不留在 database lock 內。

Business commit 後才允許完成的 external effect，需要 durable expectation / idempotent retry / readback；不能用一次 function call 的表面原子性冒充真正 recovery semantics。

Import 與 public surface 細節看 [Dependency rules](040-dependency-rules.md)；可執行 enforcement 看 [Architecture guards](../060-engineering/060-architecture-guards.md)。
