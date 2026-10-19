// Global and module styles must share a layer to preserve their original cascade.
module.exports = () => ({
  postcssPlugin: "web-legacy-modules",
  Once(root, { AtRule }) {
    if (!root.source?.input.file?.endsWith(".module.css")) return;
    const layer = new AtRule({ name: "layer", params: "legacy", source: root.source });
    const nodes = [...root.nodes];
    root.removeAll();
    layer.append(nodes);
    root.append(layer);
  },
});
module.exports.postcss = true;
