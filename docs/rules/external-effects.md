# External effect rules

任何會改 remote provider / production state 的操作都必須具備：

```text
explicit intent
+ exact target
+ authorization
+ precondition
+ idempotency / safe retry
+ post-write readback
+ recovery path
```

Repository validation與 external mutation分開。Git push不等於 deployment；Vercel READY不等於 Supabase schema converged；provider HTTP success不等於 business outcome。

Unknown result不得盲目重做。先用原 request / target readback判斷 committed、not-committed或仍 unknown，再依 owner recovery contract處理。

具體 release順序、Supabase reconciliation、LINE publication、Vercel deployment只在對應 task/reference需要時載入。
