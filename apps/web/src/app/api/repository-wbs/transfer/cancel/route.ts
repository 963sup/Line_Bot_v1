import { wbsTransferCancel } from "../../../../../modules/repository/wbs-transfer-http.server";
import { activeLineUser } from "../../../_composition/account.server";
import { requestLineIdentity } from "../../../_composition/request-identity.server";
import { wbsTransferStore } from "../../../_composition/wbs-transfer.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return wbsTransferCancel(
    request,
    wbsTransferStore,
    requestLineIdentity,
    activeLineUser,
    Date.now,
  );
}
