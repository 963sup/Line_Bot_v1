import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { test } from "node:test";
import postcss from "postcss";
import legacyModules from "../postcss/legacy-modules.cjs";
import postcssConfig from "../postcss.config.mjs";

test("the module transform resolves independently of Turbopack's compiled config directory", () => {
  const plugin = Object.keys(postcssConfig.plugins).find((name) =>
    name.endsWith("legacy-modules.cjs"),
  );
  assert.ok(plugin && isAbsolute(plugin));
  assert.ok(existsSync(plugin));
});

test("CSS Modules share the legacy layer without changing their selectors or declarations", async () => {
  const source = ".panel { padding: 20px } @media (width < 600px) { .panel { padding: 12px } }";
  for (const from of ["/project/panel.module.css", "C:/project/panel.module.css"]) {
    const result = await postcss([legacyModules()]).process(source, { from });
    const layer = result.root.first;
    assert.ok(layer?.type === "atrule");
    assert.equal(layer.name, "layer");
    assert.equal(layer.params, "legacy");
    assert.deepEqual(
      layer.nodes?.map((node) => node.toString()),
      postcss.parse(source).nodes.map((node) => node.toString()),
    );
  }
});

test("the shared Tailwind entry keeps its own explicit layers", async () => {
  const source =
    "@layer theme, legacy, base, components, utilities; @layer base { [data-slot] { margin: 0 } }";
  const result = await postcss([legacyModules()]).process(source, { from: "/project/globals.css" });
  assert.equal(result.css, source);
});
