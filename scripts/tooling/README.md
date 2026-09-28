# Repository tooling scripts

本目錄擁有 repository-level validation/toolchain operations，不擁有產品規則。一般使用 root `package.json` canonical commands。

| Script | 用途 |
| --- | --- |
| `validate.mjs` | `pnpm check` / `pnpm validate` 唯一 orchestration implementation；依 scope/group 執行 lockfile、tooling/docs/lint/architecture/schema/deadcode/typecheck/test/build。 |
| `validate.test.mjs` | 驗證 validation group completeness、fast scope classification 與 affected selection。 |
| `check-tooling.mjs` | `pnpm tooling:check`：驗證 pinned toolchain、manifest/catalog、format/reachability/workflow/agent contracts，以及 scripts README completeness。 |
| `check-tooling.test.mjs` | 驗證 tooling governance checker positive/negative cases。 |
| `check-rules.mjs` | 驗證 runtime/tool rule configuration 可解析且符合 repository execution-policy constraints。 |
| `doctor.mjs` | `pnpm tooling:doctor`：檢查 exact Node/pnpm、Git、必要 workspace dev tools，env 只回報 key 是否存在。 |
| `doctor.test.mjs` | 驗證 env key parsing 與 required toolchain health evaluation。 |

`tooling:doctor` 是 developer environment diagnosis；`tooling:check` 是 repository contract validation。兩者 evidence 不互相替代。
