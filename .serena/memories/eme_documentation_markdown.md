# EME Documentation Markdown

Use the smallest format that makes the rule or relationship unambiguous:

- Short rule sentence: AI behavior, limits, prohibitions.
- If/Then rule: conditions, exceptions, failure paths, execution choices.
- Markdown list: independent rules, requirements, or cautions.
- Heading hierarchy: document structure and information levels.
- Fenced code block: shell commands, code examples, tests, configuration templates.
- Markdown table: condition mappings, command/config comparisons, structured fields.
- Mermaid `stateDiagram`: state machines, transitions, triggers, transition guards.
- Mermaid `sequenceDiagram`: API call order, service interaction, cross-system data flow.
- Mermaid `flowchart`: workflows, branches, decisions, task order.
- ASCII tree: repository directories, module placement, file locations.
- Mermaid `erDiagram`: database entities, tables, relationships, data models.
- YAML/JSON: machine-readable configuration, structured specifications, data formats.
- Mermaid `classDiagram`: classes, inheritance, interfaces, implementations, dependencies.

Prefer plain Markdown for a single rule. Add a diagram only when the relationship or sequence is materially clearer than prose. Keep examples bounded and consistent with current source; never use a diagram or table as a second authority for code, schema, or architecture JSON.
