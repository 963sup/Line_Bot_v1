import { lineMiniApp } from "@line_bot_v1/line-channel/mini-app";
import ProfileEntry from "./profile-entry";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ProfileEntry liffId={lineMiniApp().liffId} />;
}
