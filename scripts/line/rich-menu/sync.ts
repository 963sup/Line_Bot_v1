import { runRichMenuOperation } from "../../../apps/web/src/modules/assistant/rich-menu/operator.server.ts";
import { loadRootEnv, repositoryRoot } from "../../runtime/load-env.mjs";

loadRootEnv();

try {
  const [command = "preview", target = "home"] = process.argv.slice(2);
  const result = await runRichMenuOperation({
    command,
    target,
    repositoryRoot,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Rich menu operation failed");
  process.exitCode = 1;
}
