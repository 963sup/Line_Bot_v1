import { filesRequest } from "../_composition/files.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = filesRequest;
export const POST = filesRequest;
