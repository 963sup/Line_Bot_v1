import { createPostgresFileHttpHandler } from "@line_bot_v1/file/composition/bootstrap/files";
import { repositoryRequestContext } from "../_composition/repository-request-context.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const request = createPostgresFileHttpHandler(repositoryRequestContext("repository-files-api"));

export const GET = request;
export const POST = request;
