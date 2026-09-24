# Web notifications module

- Owns notification inbox presentation and read-state transport only; source Issue/Discussion facts remain in their owners.
- Do not reintroduce announcement publishing, audit-publication or generic broadcast semantics through this module.
- Missing/unavailable source data is not an empty inbox; preserve explicit error states.
- Recipient identity comes from the verified request identity and is never accepted from URL or client payload.
