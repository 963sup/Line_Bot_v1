# Vercel Free 開發入口

本目錄提供 Vercel 能力分類與文件導航，並與 [Supabase 開發入口](../../integration-supabase/src/README.md) 維持相同的 provider boundary。這些是 repository 文件目錄，不是 Vercel 原生部署路徑；runtime、SDK、設定或雲端資源是否啟用，仍以各 Owner、source、manifest 與 provider readback 為準。

## Source of Truth

| Concern | Canonical source |
| --- | --- |
| Web / API implementation | [apps/web](../../../apps/web/AGENTS.md) 與各業務 Owner |
| Native deployment configuration | [apps/web/vercel.json](../../../apps/web/vercel.json) |
| Framework / build configuration | [next.config.ts](../../../apps/web/next.config.ts)、[package.json](../../../apps/web/package.json) |
| Deployment upload boundary | [.vercelignore](../../../.vercelignore) |
| Platform / production readback | [Vercel platform](../../../docs/reference/platform/vercel.md) |
| Publication / recovery | [Release](../../../docs/reference/operations/release.md)、[Recovery](../../../docs/reference/operations/recovery.md) |
| Application configuration names | [.env.example](../../../.env.example)；不在本目錄保存值 |

不在 `vercel/` 複製 `vercel.json`、`.env`、部署 script 或 `.vercel/project.json`。正式設定與程式保留在上表既有位置。

## Capability layout

```text
vercel/
├── README.md
├── deployments/README.md    # Build / Preview / Production / recovery
├── functions/README.md      # Next.js server runtime / execution limits
├── routing/README.md        # Routes / redirects / rewrites / headers
├── caching/README.md        # CDN / application cache / images
├── cron/README.md           # Scheduled invocation / existing scheduler boundary
├── environment/README.md    # Development / Preview / Production configuration
├── domains/README.md        # DNS / TLS / aliases / callback origins
├── security/README.md       # Firewall / deployment protection / authorization
├── observability/README.md  # Runtime logs / errors / usage
├── analytics/README.md      # Web Analytics / Speed Insights
├── storage/README.md        # Blob / configuration / persistence boundaries
├── integrations/README.md   # Marketplace / provider resources
└── tests/README.md          # Verification entrypoints / future smoke scenarios
```

能力入口：[Deployments](deployments/README.md) · [Functions](functions/README.md) · [Routing](routing/README.md) · [Caching](caching/README.md) · [Cron](cron/README.md) · [Environment](environment/README.md) · [Domains](domains/README.md) · [Security](security/README.md) · [Observability](observability/README.md) · [Analytics](analytics/README.md) · [Storage](storage/README.md) · [Integrations](integrations/README.md) · [Tests](tests/README.md)。

## Free / Hobby boundary

Vercel Free 對應官方 Hobby plan。此處是開發分類，不是目標帳戶方案、權益或啟用狀態的 readback；配額與可用功能以 [Hobby 官方文件](https://vercel.com/docs/plans/hobby) 及目標 project 當下設定為準，不把付費、試用或外部服務額度當成永久免費。

Hobby 限個人、非商業用途；本結構不代表產品的商業部署已符合 Hobby 使用範圍。後續啟用前另核對方案資格、資源用量與所需權益。

文件驗證使用 local link check 與適用 static checks；其他 runtime、provider 與裝置證據見 [Tests](tests/README.md)。
