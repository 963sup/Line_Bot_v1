import { commercialIntakeRequest } from "../../../modules/document-intake/commercial-intake-http.server";
import { commercialIntake } from "../_composition/commercial-intake.server";
import { requestLineIdentity } from "../_composition/request-identity.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export function GET(request: Request) {
  return commercialIntakeRequest(request, commercialIntake(), requestLineIdentity);
}
export function POST(request: Request) {
  return commercialIntakeRequest(request, commercialIntake(), requestLineIdentity);
}
