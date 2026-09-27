# @line-work/account

- Owns User identity, Account lifecycle, login-directory/profile/follow capabilities, and Account qualification facts.
- Does not own Employment, Organization membership, or authorization policy; consume those owners through explicit contracts.
- External identity proof is evidence for Account operations, not authority to invent business qualification.
- Preserve lifecycle/version checks, replay safety, tenant isolation, and public-contract boundaries when changing Account behavior.
- Login is Account-owned locator state shared by User and Organization resolution; keep stable UserId as identity, keep login/display/profile as mutable projections, and do not use provider display data as Account authority.
- Profile visibility governs Account-authored profile fields only. It does not hide identity existence, grant private access, or replace per-owner authorization checks.
- Follow edges are Account-owned social relations between active users; they are not Organization membership, Team participation, Repository access, notification subscription, or authorization evidence.
- Google linking is optional external mapping: pending link requests remain explicit, one-time and version/expiry-bound. Unlink requires trusted LINE identity and explicit active-User intent; preserve ownership/history, and never merge users by email.
