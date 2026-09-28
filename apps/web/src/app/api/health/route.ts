export const runtime = "nodejs";

// Liveness only: no external service calls; never cache the response.
export function GET() {
  const response = { status: "ok", service: "web" };
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
