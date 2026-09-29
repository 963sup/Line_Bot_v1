import { teamAssert } from "../errors/team-error.js";

const teamSlugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function normalizeTeamSlug(value: string): string {
  const slug = value.normalize("NFKC").trim().toLowerCase();
  teamAssert(
    slug.length >= 1 && slug.length <= 80 && teamSlugPattern.test(slug),
    400,
    "Team slug 不正確。",
  );
  return slug;
}

export function teamSlugFromName(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalizeTeamSlug(slug);
}
