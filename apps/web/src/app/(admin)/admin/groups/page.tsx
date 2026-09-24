import PartnerManagement from "../../../../modules/partners/manage-panel";
import { lineMiniApp } from "../../../../shared/server/line-mini-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return <PartnerManagement liffId={lineMiniApp().liffId} />;
}
