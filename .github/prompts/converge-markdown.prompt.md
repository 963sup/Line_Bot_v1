---
agent: 'agent'
description: 'Converge one Markdown file to the smallest sufficient agent context'
---

Use the repository's `.agents/skills/context-convergence/SKILL.md`.

Scope: ${input:scope:Path or directory to converge; leave blank to choose the oldest unprocessed Markdown candidate}

Converge exactly one existing Markdown file. Preserve authoritative meaning and all behavior-changing constraints. The resulting file must be smaller than before, unless compression would weaken correctness; in that case, report why and make no change.

Report the path, before/after size, canonical references retained, and validation evidence.
