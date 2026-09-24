# @line-work/workforce

- Owns the target Workforce responsibility: Employment lifecycle, EmploymentTerms, WorkPolicyVersion, Calendar and Schedule semantics.
- Does not own User identity/qualification, Organization participation, actual Attendance facts, Payroll calculation/result, or authorization policy.
- Employment is a time-bounded working relationship between User and Organization; Employee is a contextual description, not a global identity or AccountKind.
- The workspace/module boundary is active, but runtime capability, public exports and Workforce persistence are not. Do not invent APIs, adapters, schema or policy defaults before a real use case and authority decision exists.
- Before activating the first Workforce capability, resolve the canonical open policies called out by the owner doc, including OrganizationMembership qualification and overlapping Employment semantics.
- Changes follow the repository decision chain: first principles → expert benchmark/repository evidence → root cause → Owner/Truth/Boundary → Occam's Razor → validation.
