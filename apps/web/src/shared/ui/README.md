# Web UI components

shadcn/ui source lives here under the existing [Shared UI boundary](AGENTS.md). Business forms and actions stay in their feature modules.

## Installation and updates

Run the pinned CLI from the repository root:

```sh
pnpm --filter @line_bot_v1/web ui info
pnpm --filter @line_bot_v1/web ui add dialog --dry-run
pnpm --filter @line_bot_v1/web ui add dialog --diff
```

The configuration is [components.json](../../../components.json). It selects `radix-nova` and routes UI, helpers and hooks to this directory. Some upstream components, including Combobox, use Base UI even in the Radix registry.

The complete official `registry:ui` catalog was downloaded using shadcn 4.22.1 on 2026-10-20. There are 63 installed component entries, one highlighter helper and two hooks. The official `form` registry entry currently contains no source; use `Field` with the form library appropriate to the feature. Blocks, examples, fonts and third-party registries are separate from this component catalog.

Sources: [official registry](https://ui.shadcn.com/r/styles/radix-nova/registry.json), [CLI](https://ui.shadcn.com/docs/cli), [Field](https://ui.shadcn.com/docs/components/field).

## Styling and consumption

- Import individual files using relative paths, for example `import { Button } from "../../shared/ui/button"` in a feature module. Keep CLI-generated imports relative after updates so the architecture graph resolves the same files without alias exceptions. Avoid a barrel that loads the full catalog.
- [globals.css](../../app/globals.css) owns Tailwind/theme setup; [legacy.css](legacy.css) preserves the previous stylesheet in its own layer.
- The [PostCSS module transform](../../../postcss/legacy-modules.cjs) puts existing CSS Modules in the same `legacy` layer, preserving their specificity and source-order relationship with the global stylesheet.
- Preflight is opt-in at each primitive's `data-slot` boundary. Existing native HTML keeps its original browser defaults; Tailwind utilities override the legacy layer on new primitives.
- The reset does not traverse feature children inside Card/Dialog content. Calendar owns the reset for its third-party-generated internal markup.
- The existing foreground token `--muted` stays separate from shadcn's background token `--ui-muted`.
- Dark variants support `.dark` and the existing `.app-shell`. For portaled content outside the shell, apply `className="dark"` to the content when its caller uses the dark theme.
- TooltipProvider is installed at the application root. Other providers belong with the consumer that needs them.

## Local adaptations and verification

Upstream source is adapted to the repository's strict optional-property types, checked CSS-variable types, runtime record/DOM narrowing and exhaustive hook dependencies. Sidebar skeleton widths are deterministic across server rendering and hydration. Do not overwrite these adaptations blindly during updates.

[Catalog tests](../../../test/ui-catalog.test.ts) check all downloaded runtime exports, code highlighting, class merging and server composition. They do not establish interactive acceptance for every component. Run the repository checks and verify affected interactions in a browser after updates.
