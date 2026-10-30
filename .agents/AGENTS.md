# `.agents/` scope

Inherits the [root contract](../AGENTS.md). This directory follows the official Codex Skills and Plugins layout. It is a
repository integration surface, not a second application runtime or product
governance layer.

## Official layout

```text
.agents/
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── agents/       # optional skill support metadata
│       ├── references/   # optional supporting material
│       ├── scripts/      # optional skill-local helpers
│       └── assets/       # optional skill-local assets
└── plugins/
    ├── marketplace.json
    ├── api_marketplace.json
    └── <plugin-name>/
        ├── .codex-plugin/plugin.json
        ├── skills/        # optional plugin skills
        ├── agents/        # optional plugin agents
        ├── commands/      # optional plugin commands
        ├── hooks.json     # optional plugin hooks
        ├── .mcp.json      # optional plugin MCP servers
        ├── .app.json      # optional app metadata
        └── assets/        # optional plugin assets
```

`skills-lock.json` records installed skill sources, revisions, and hashes. It
does not replace the installed `SKILL.md` files and is not an execution entry
point.

## Change rules

- Install, update, and remove Skills with the official Skills CLI. Keep
  `skills-lock.json` synchronized with the installed files.
- Do not hand-edit third-party Skill contents, metadata, references, scripts,
  or assets.
- A Plugin must contain its manifest at
  `<plugin>/.codex-plugin/plugin.json`; Plugin agents and commands stay inside
  that Plugin.
- Do not create repository-level `.agents/agents/`, `.agents/rules/`,
  `.agents/catalog/`, `.agents/schemas/`, or `.agents/scripts/` as parallel
  governance systems.
- Root and nearest `AGENTS.md`, product contracts, source, schemas, tests, and
  official provider documentation remain authoritative over third-party Skill
  guidance.
- Reading a Skill proves only that its instructions were inspected. Tests,
  provider readback, deployment evidence, and runtime acceptance require their
  own verification.

Official references:

- <https://developers.openai.com/codex/skills>
- <https://developers.openai.com/codex/plugins>
- <https://github.com/openai/plugins>
