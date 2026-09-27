# @line-work/assistant

- Owner boundary: Assistant owns answer orchestration, Gemini adapter and Issue-draft intake; business authority remains with the owning module. Canonical semantics: [Assistant](../../docs/owners/assistant.md).
- `answer-question` accepts only trusted delivery text. Cross-owner writes must use that owner's public contract and authorization; intake may draft an Issue but must not assign, persist, authorize or notify.
- Preserve injected `now()` for explicit time questions, 500-char input / 2000-char output bounds, general-generation cooldown, and distinct empty/unavailable results. Issue drafting does not consume the general cooldown.
- Gemini uses Developer API (`vertexai: false`). Provider guards stay package-private; do not introduce a generic provider framework without a real variation.
