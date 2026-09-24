# Onboarding route group

- Onboarding routes collect explicit intent and invoke Account/Organization owner contracts; invitation, membership or restore UI does not itself create authority.
- Registration, restore, link and confirmation flows must preserve request identity, current session consistency, version/replay and cancel/account-change semantics.
- Never infer successful provisioning from navigation or a rendered success state; use the owner result and readback contract.
