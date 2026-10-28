# Google Workspace platform reference

Google Workspace provider content is owned by [`packages/google-workspace`](../../../packages/google-workspace/README.md). This file is a cross-package index only.

- OAuth token handling and provider adapters：[Google Workspace package](../../../packages/google-workspace/README.md)。
- Product identity, authorization and resource ownership：[Google Workspace owner](../../owners/google-workspace.md) and the relevant domain owner.
- OAuth／recovery readiness：以 package tests、owner contract 與實際 provider readback 為準。

Provider capability does not imply an enabled product flow. A first write must use a stable local owner／scope／version, explicit confirmation and an operation contract that can represent an unknown external result.
