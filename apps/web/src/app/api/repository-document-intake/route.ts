import { documentIntakeRequest } from "../../../modules/document-intake/document-intake-http.server";
import { documentIntake } from "../_composition/document-intake.server";
import { requestLineIdentity } from "../_composition/request-identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET(request: Request) {
  return documentIntakeRequest(request, documentIntake(), requestLineIdentity);
}

export function POST(request: Request) {
  return documentIntakeRequest(request, documentIntake(), requestLineIdentity);
}
