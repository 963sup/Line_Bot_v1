import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import GoogleLinkPage from "../../../modules/account/google-link-page";

export default function Page() {
  return <GoogleLinkPage miniAppUrl={lineMiniApp().url} />;
}
