import Link from "next/link";
import { notFound } from "next/navigation";
import { repositoryPath } from "../../../modules/repository/resource-navigation";
import { PageHeading, SectionHeading } from "../../../shared/ui/page-layout";
import { loginDirectory, profiles, publicUserByLogin } from "../../api/_composition/account.server";
import ProfileShare from "../_components/profile-share";
import { publicOrganizations } from "../_composition/directory.server";
import { publicRepositories } from "../_composition/repository.server";

export const dynamic = "force-dynamic";

function ProfileAvatar({ label }: { label: string }) {
  const initial = Array.from(label.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "•";
  return (
    <div className="public-profile-avatar" aria-hidden="true">
      {initial}
    </div>
  );
}

async function repositoryProjection(login: string) {
  return publicRepositories().listByOwner(login, 6);
}

function RepositorySection({
  repositories,
}: {
  repositories: Awaited<ReturnType<typeof repositoryProjection>>;
}) {
  if (repositories.totalCount === 0) return null;
  return (
    <section>
      <SectionHeading
        title="Repositories"
        description={`${repositories.totalCount} 個公開 Repository`}
      />
      <div className="menu-group">
        {repositories.items.map((repository) => (
          <Link
            className="action-row"
            key={repository.id}
            href={repositoryPath(repository.ownerLogin, repository.name)}
          >
            <span className="action-row-copy">
              <strong>{repository.name}</strong>
              <small>
                {repository.ownerLogin}/{repository.name}
              </small>
            </span>
            <span className="action-chevron" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function Page({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const owner = await loginDirectory.resolve(login);
  if (!owner) notFound();

  if (owner.kind === "ORGANIZATION") {
    const organization = await publicOrganizations().byLogin(owner.login);
    if (!organization) notFound();
    const repositories = await repositoryProjection(owner.login);
    return (
      <main className="app-content">
        <p className="eyebrow">Organization</p>
        <PageHeading
          title={organization.name}
          description={`@${organization.login}`}
          actions={<ProfileShare />}
        />
        <RepositorySection repositories={repositories} />
      </main>
    );
  }

  const user = await publicUserByLogin(owner.login);
  if (!user) notFound();
  const [profile, repositories] = await Promise.all([
    profiles.publicByUserId(user.id),
    repositoryProjection(owner.login),
  ]);
  return (
    <main className="app-content">
      <p className="eyebrow">User</p>
      <div className="public-profile-identity">
        <ProfileAvatar label={profile?.displayName ?? user.login} />
        <PageHeading
          title={profile?.displayName ?? `@${user.login}`}
          description={`@${user.login}`}
          actions={<ProfileShare />}
        />
      </div>
      {profile?.bio && <p>{profile.bio}</p>}
      <RepositorySection repositories={repositories} />
    </main>
  );
}
