export function isOwnProfileLogin(accountLogin: unknown, profileLogin: string) {
  return typeof accountLogin === "string" && accountLogin === profileLogin;
}
