import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import PartnerManagement from "../../../../../modules/partners/manage-panel";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PartnerManagement liffId={lineMiniApp().liffId} />
    </>
  );
}
