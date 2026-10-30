# Owner router

Project scope content: [WBS](wbs.md). Repository work definitions and plan versions: [Content](content.md). Shared physical identities: [Resources](resources.md). Repository pages: [Wiki](wiki.md). Purchase-order documents and formal work commitments: [Contract](contract.md). Task actuals, prerequisites and review: [Execution](execution.md). Work-item lifecycle: [Issue](issue.md); cross-source planning: [Project](project.md). Read-only metrics: [Insights](insights.md). Business automation: [Actions](actions.md).

Use one owner contract for the affected responsibility. Exact current owner/status remains authoritative in `architecture/registry.json#domain`.

Business owners: [File](file.md) · [Namespace](../reference/domains/namespace.md) · [Numbering](../reference/domains/numbering.md) · [Account](../reference/domains/account.md) · [Enterprise](../reference/domains/enterprise.md) · [Organization](../reference/domains/organization.md) · [Workforce](workforce.md) · [Attendance](../reference/domains/attendance.md) · [Payroll](../reference/domains/payroll.md) · [Team](../reference/domains/team.md) · [Repository](../reference/domains/repository.md) · [Content](content.md) · [Resources](resources.md) · [Contract](contract.md) · [Execution](execution.md) · [Issue](issue.md) · [Discussion](discussion.md) · [Project](project.md) · [Notifications](notifications.md) · [Expense](expense.md) · [Partners](partners.md) · [Asset](asset.md) · [Wallet](../reference/domains/wallet.md) · [Ledger](../reference/domains/ledger.md) · [Daily Check-in](../reference/domains/daily-check-in.md).

Policy / support / integration owners: [Identity & Access](identity-access.md) · [Audit](audit.md) · [LINE integration](line-integration.md) · [Google Workspace](google-workspace.md) · [Intelligence](intelligence.md) · [Assistant](assistant.md) · [Platform](platform.md).

Load detailed reference only when the owner contract points to a specific flow or mechanism.

Integration owner routing:

- [LINE integration](line-integration.md) → [`packages/line`](../../packages/line/README.md) and `docs/reference/line/` provider references.
- [Google Workspace](google-workspace.md) → [`packages/google-workspace`](../../packages/google-workspace/README.md).
- [OpenAI integration](openai-integration.md) → [`packages/integration-openai`](../../packages/integration-openai/README.md).
- [Supabase integration](supabase-integration.md) → [`packages/integration-supabase/src`](../../packages/integration-supabase/src/README.md).
- [Vercel integration](vercel-integration.md) → [`packages/integration-vercel/src`](../../packages/integration-vercel/src/README.md).
- [Platform](platform.md) → [`packages/platform`](../../packages/platform/README.md).
