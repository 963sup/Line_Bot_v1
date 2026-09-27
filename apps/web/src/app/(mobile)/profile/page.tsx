import { lineMiniApp } from "../../../shared/server/line-mini-app";
import ProfileEntry from "./profile-entry";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ProfileEntry liffId={lineMiniApp().liffId} />;
}
