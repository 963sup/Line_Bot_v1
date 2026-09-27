# @line-work/assistant

Owner: Assistant answer orchestration, Gemini adapter, and Issue-draft intake. Canonical semantics: [Assistant](../../docs/owners/assistant.md).

- Accept only trusted delivery text; cross-owner writes require that owner's public contract and authorization.
- Intake may draft only: no assign, persist, authorize, or notify.
- Preserve injected `now()`, 500-char input, 2000-char output, general cooldown, and distinct empty/unavailable results. Issue drafts do not consume the general cooldown.
- Gemini stays on Developer API (`vertexai: false`); keep provider guards package-private.
