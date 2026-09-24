import { notFound } from "next/navigation";
import { loginDirectory, profiles, publicUserByLogin } from "../../api/_composition/account.server";
import { publicOrganizations } from "../_composition/directory.server";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const owner = await loginDirectory.resolve(login);
  if (!owner) notFound();

  if (owner.kind === "ORGANIZATION") {
    const organization = await publicOrganizations().byLogin(owner.login);
    if (!organization) notFound();
    return (
      <main className="app-content">
        <p className="eyebrow">Organization</p>
        <h1>{organization.name}</h1>
        <p>@{organization.login}</p>
      </main>
    );
  }

  const user = await publicUserByLogin(owner.login);
  if (!user) notFound();
  const profile = await profiles.publicByUserId(user.id);
  return (
    <main className="app-content">
      <p className="eyebrow">User</p>
      <h1>{profile?.displayName ?? `@${user.login}`}</h1>
      <p>@{user.login}</p>
      {profile?.bio && <p>{profile.bio}</p>}
    </main>
  );
}
