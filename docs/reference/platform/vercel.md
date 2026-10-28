# Vercel platform reference

Vercel 的 provider integration、AI Gateway、environment、capability routing 與 deployment boundary 由 [`integration-vercel`](../../../packages/integration-vercel/src/README.md) 擁有。本文件只提供跨 package 索引，不保存第二套 provider contract。

## Canonical content

- Vercel configuration、AI Gateway credential/model boundary 與 capability layout：[integration-vercel README](../../../packages/integration-vercel/src/README.md)。
- Web／API implementation、route 與 business composition：[apps/web](../../../apps/web/AGENTS.md) 與各 domain owner。
- Native deployment source：[apps/web/vercel.json](../../../apps/web/vercel.json)、[next.config.ts](../../../apps/web/next.config.ts)、[apps/web/package.json](../../../apps/web/package.json) 與 [.vercelignore](../../../.vercelignore)。
- Publication ordering、release evidence、recovery：[Release](../operations/release.md)、[Recovery](../operations/recovery.md)。

## Cross-package boundary

Vercel deployment READY、AI Gateway response 或 provider readback 都不能取代產品 authorization、domain validation、database persistence、LINE/provider acceptance 或 device acceptance。Provider-specific change 先修改 integration package 或 executable source，再由 owner package 驗證 consumer contract。
