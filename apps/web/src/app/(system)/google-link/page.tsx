import GoogleLinkPage from "../../../modules/account/google-link-page";
import { lineMiniApp } from "../../../shared/server/line-mini-app";

export default function Page() {
  return <GoogleLinkPage miniAppUrl={lineMiniApp().url} />;
}
