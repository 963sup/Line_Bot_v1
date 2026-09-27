import { type GoogleRequestOptions, readPages, requestJson, resourceId } from "./request.js";

const base = "https://tasks.googleapis.com/tasks/v1";
export function listTaskLists(options: GoogleRequestOptions, request: typeof fetch = fetch) {
  return readPages(new URL(`${base}/users/@me/lists`), "items", options, request);
}
export function listTasks(
  options: GoogleRequestOptions & { taskListId: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(`${base}/lists/${resourceId(options.taskListId)}/tasks`);
  url.searchParams.set("showCompleted", "true");
  url.searchParams.set("showHidden", "true");
  return readPages(url, "items", options, request);
}
export function createTask(
  options: GoogleRequestOptions & { taskListId: string; title: string; notes?: string },
  request: typeof fetch = fetch,
) {
  return requestJson(
    new URL(`${base}/lists/${resourceId(options.taskListId)}/tasks`),
    options,
    request,
    "POST",
    { title: options.title, notes: options.notes },
  );
}
/** @public Public Tasks adapter listed in packages/google-workspace/README.md. */
export function setTaskStatus(
  options: GoogleRequestOptions & {
    taskListId: string;
    taskId: string;
    status: "needsAction" | "completed";
  },
  request: typeof fetch = fetch,
) {
  return requestJson(
    new URL(`${base}/lists/${resourceId(options.taskListId)}/tasks/${resourceId(options.taskId)}`),
    options,
    request,
    "PATCH",
    { status: options.status },
  );
}
