# File scope

繼承 [packages 約束](../AGENTS.md)。

變更來源讀取或資格檢查時，一併核對 `src/contracts/output/references.ts` 的 consumer；原始檔識別與解析結果分開處理。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。

## File provenance authority

- File alone owns original bytes, their immutable revision identities, source hash and authorized retrieval. A new source version creates a new revision; downstream corrections never rewrite old bytes or SHA evidence.
- Expose narrow authorized revision/reference reads. Intelligence may interpret an exact File revision, but downstream Owners never write File private storage or treat model output as original File truth.
- Preserve source ID, FileRevision ID and SHA-256 in downstream evidence. Missing, mismatched or revoked source access fails closed rather than silently substituting the latest revision.
