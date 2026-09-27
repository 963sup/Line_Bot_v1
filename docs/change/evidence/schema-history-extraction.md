# Schema history extraction — 2026-09-13

基準 commit：`30f241afaae425ecdc68f73d2296651adb557dd2`。本 evidence 只保留「歷史 migration 為何可以退出 current tree」的 recovery contract，不代表 current Supabase state。

## Retained evidence

五份歷史 SQL 的有效 final DDL 已由當時的 declarative `supabase/schemas/` 完整承接；一次性 backfill、rolling bridge、transition lock 與 retired table 不再成為 current schema dependency。原始 bytes 仍可從上述 commit 的 `supabase/migrations/` 讀回。

當時以隔離 clean rebuild 比對歷史 final DDL 與 declarative schemas，catalog semantics 一致；remote readback 也未出現需要額外套用的語意 DDL，因此沒有為了「留下 migration history」再做無用途 remote write。

Recovery 時只把 Git revision 當歷史來源，不對 current database 重播舊 baseline：

```sh
git show 30f241afaae425ecdc68f73d2296651adb557dd2:supabase/migrations/20260912023739_consolidated_baseline.sql
```

## Boundary

- Current database structure 只由 `supabase/schemas/` 擁有。
- `supabase_migrations` history 不是 current schema authority。
- 本 evidence 不證明 current remote parity、deployment、LINE device 或 business acceptance。
- 後續 Account expansion 見 [Account expansion evidence](050-account-expansion-extraction.md)。

原始逐檔 checksum、catalog counts 與當次 row snapshot 已從 working tree 蒸餾；需要稽核時由 Git history 取得。
