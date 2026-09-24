import { notificationRequest } from "../../../modules/notifications/api.server";
import { notifications } from "../_composition/notifications.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  notificationRequest(request, notifications, () => requestLineIdentity(request));

export const POST = (request: Request) =>
  notificationRequest(request, notifications, () => requestLineIdentity(request));
