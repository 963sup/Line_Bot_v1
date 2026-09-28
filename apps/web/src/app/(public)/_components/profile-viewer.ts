export function isOwnProfileLogin(accountLogin: unknown, profileLogin: string) {
  return typeof accountLogin === "string" && accountLogin === profileLogin;
}

export function isVerifiedSelfUser(
  member: { id?: unknown; login?: unknown; status?: unknown } | null | undefined,
  profileUserId: string,
  profileLogin: string,
  profileKind: "USER" | "ORGANIZATION",
) {
  return (
    profileKind === "USER" &&
    member?.id === profileUserId &&
    member?.status === "active" &&
    isOwnProfileLogin(member.login, profileLogin)
  );
}
