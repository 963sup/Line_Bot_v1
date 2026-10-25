# Machine contract constraints

**Scope:** L4/L5/L6 interchange schemas only.

- These JSON Schema files define packet, handoff, capability-route, and evidence-plan shape; they do not grant authority or replace their Markdown Owner documents.
- Keep schemas strict (`additionalProperties: false`) and versioned. Add fields compatibly; do not silently change meaning of an existing field.
- Update the owning Markdown contract and all real producers/consumers before changing a schema.
- Validate JSON syntax, schema references, and Markdown links; static schema validity does not prove an agent session or provider used the contract.
