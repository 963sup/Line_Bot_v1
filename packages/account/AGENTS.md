# @line-work/account

- Owns User identity, Account lifecycle, login-directory/profile/follow capabilities, and Account qualification facts.
- Does not own Employment, Organization membership, or authorization policy; consume those owners through explicit contracts.
- External identity proof is evidence for Account operations, not authority to invent business qualification.
- Preserve lifecycle/version checks, replay safety, tenant isolation, and public-contract boundaries when changing Account behavior.
