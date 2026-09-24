# Web expense module

- Owns expense and receipt presentation; Expense owner controls receipt intent, recognition confidence, revision and final command.
- AI recognition is a draft/read result; UI confirmation must still invoke owner authorization and transactional revision checks.
- Never treat uploaded bytes, card rendering or client amount/category as posted ledger facts.
