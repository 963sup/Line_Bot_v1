import { fileURLToPath } from "node:url";

export default {
  plugins: {
    [fileURLToPath(new URL("./postcss/legacy-modules.cjs", import.meta.url))]: {},
    "@tailwindcss/postcss": {},
  },
};
