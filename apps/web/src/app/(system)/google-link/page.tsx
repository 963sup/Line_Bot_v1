import GoogleLinkPage from "../../../modules/account/google-link-page";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";

export default function Page() {
  return <GoogleLinkPage miniAppUrl={lineMiniApp().url} />;
}
