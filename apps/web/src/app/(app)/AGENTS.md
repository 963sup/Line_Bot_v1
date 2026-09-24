# Authenticated app route group

- Authenticated routes compose owner projections and commands for the current trusted Principal; login/session presence alone does not imply business qualification.
- Selected Organization, Team, Employment or resource IDs are intent/scope inputs and must be revalidated by the owner on every protected operation.
- Preserve mobile-first continuation, loading/empty/error distinctions and server authority across client navigation.
