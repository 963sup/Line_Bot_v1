// Real Overview route/components; only server queries and Next delivery are synthetic.
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function startRepositoryOverviewFixture(output) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const web = path.join(root, "apps/web");
  const require = createRequire(path.join(web, "package.json"));
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  const directory = path.join(output, "overview-fixture");
  mkdirSync(directory, { recursive: true });
  const adapters = {
    "next/link":
      "import React from 'react'; export default function Link({children,href,...props}) { return <a href={href} {...props}>{children}</a>; }",
    "next/script":
      "import {useEffect} from 'react'; export default function Script({onReady}) { useEffect(()=>{onReady?.()},[]); return null; }",
    "next/navigation":
      "export function usePathname(){return location.pathname} export function useRouter(){return {push:href=>location.assign(href),replace:href=>location.replace(href)}} export function notFound(){throw Error('not-found')}",
    "@line_bot_v1/line/mini-app": "export const lineMiniApp=()=>({liffId:'test'});",
    "repository.server":
      "export const publicRepositories=()=>({byOwnerAndName:async(ownerLogin,name)=>location.search==='?public' ? {ownerLogin,name} : null});",
  };
  await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import Page from '../../apps/web/src/app/(resource)/[login]/[repository]/page.tsx';
        import '../../apps/web/src/app/globals.css';
        const page=await Page({params:Promise.resolve({login:'acme',repository:'Operations'})});
        createRoot(document.getElementById('root')).render(page);`,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    format: "esm",
    outfile: path.join(directory, "overview.js"),
    platform: "browser",
    nodePaths: [path.join(web, "node_modules")],
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_BROWSER_TEST_HARNESS": '"true"',
    },
    plugins: [
      {
        name: "overview-delivery",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(next\/(link|script|navigation)|@line_bot_v1\/line\/mini-app)$|repository\.server$/,
            },
            ({ path: specifier }) => ({
              path: specifier.endsWith("repository.server") ? "repository.server" : specifier,
              namespace: "overview-delivery",
            }),
          );
          builder.onLoad({ filter: /.*/, namespace: "overview-delivery" }, ({ path: key }) => ({
            contents: adapters[key],
            loader: "jsx",
            resolveDir: web,
          }));
          builder.onLoad({ filter: /\.module\.css$/ }, ({ path: filename }) => ({
            contents: readFileSync(filename, "utf8"),
            loader: "local-css",
            resolveDir: path.dirname(filename),
          }));
        },
      },
    ],
  });
  const server = createServer((request, response) => {
    const name =
      request.url === "/overview.js"
        ? "overview.js"
        : request.url === "/overview.css"
          ? "overview.css"
          : null;
    response.setHeader(
      "Content-Type",
      name?.endsWith(".js") ? "text/javascript" : name ? "text/css" : "text/html",
    );
    response.end(
      name
        ? readFileSync(path.join(directory, name))
        : '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/overview.css"><div id="root"></div><script type="module" src="/overview.js"></script></html>',
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
