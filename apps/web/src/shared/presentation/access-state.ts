export type AccessState = "login" | "register" | "restore" | "allowed" | "suspended" | "error";

/** A UI decision from a verified API response, never a substitute for API authorization. */
export function accessState(
  authenticated: boolean,
  status: unknown,
  mode: "app" | "onboarding",
): AccessState {
  if (!authenticated) return "login";
  if (status === "suspended") return "suspended";
  if (status !== null && status !== "active" && status !== "paused") return "error";
  if (mode === "onboarding" || status === "active") return "allowed";
  return status === "paused" ? "restore" : "register";
}
