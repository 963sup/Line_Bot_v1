import Link from "next/link";
import { notFound } from "next/navigation";
import { repositoryPath } from "../../../modules/repository/resource-navigation";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { loginDirectory, profiles, publicUserByLogin } from "../../api/_composition/account.server";
import ProfileViewerShell from "../_components/profile-viewer-shell";
import { publicOrganizations } from "../_composition/directory.server";
import { publicRepositories } from "../_composition/repository.server";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

function ProfileAvatar({ label }: { label: string }) {
  const initial = Array.from(label.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "•";
  return (
    <div className={`public-profile-avatar ${styles.avatar}`} aria-hidden="true">
      {initial}
    </div>
  );
}

async function popularRepositoryProjection(login: string) {
  return publicRepositories().popularByOwner(login, 6);
}

function ProfileIdentity({
  login,
  title,
  bio,
}: {
  login: string;
  title: string;
  bio?: string | null;
}) {
  return (
    <div className={styles.identity}>
      <div className={styles.identityRow}>
        <ProfileAvatar label={title || login} />
        <div className={styles.identityCopy}>
          <h1>{title || `@${login}`}</h1>
          <p>@{login}</p>
        </div>
      </div>
      {bio && <p className={styles.bio}>{bio}</p>}
    </div>
  );
}

function PopularRepositories({
  repositories,
}: {
  repositories: Awaited<ReturnType<typeof popularRepositoryProjection>>;
}) {
  return (
    <section id="popular-repositories" className={styles.section}>
      <h2 className={styles.sectionHeading}>
        <svg
          viewBox="0 0 24 24"
          width="21"
          height="21"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
        </svg>
        Popular
      </h2>
      {repositories.totalCount === 0 ? (
        <p className={styles.emptyRepositories}>目前沒有公開 Repository。</p>
      ) : (
        <div className={styles.repositoryRail}>
          {repositories.items.map((repository) => (
            <Link
              className={styles.repositoryCard}
              key={repository.id}
              href={repositoryPath(repository.ownerLogin, repository.name)}
            >
              <span>
                <small className={styles.repositoryOwner}>@{repository.ownerLogin}</small>
                <strong className={styles.repositoryName}>{repository.name}</strong>
              </span>
              <span className={styles.repositoryMeta}>
                <span aria-hidden="true">★</span>
                <span>{repository.starCount}</span>
                <span>Stars</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileContent({
  login,
  title,
  bio,
  repositories,
}: {
  login: string;
  title: string;
  bio?: string | null;
  repositories: Awaited<ReturnType<typeof popularRepositoryProjection>>;
}) {
  return (
    <div className={styles.profile}>
      <ProfileIdentity login={login} title={title} bio={bio} />
      <PopularRepositories repositories={repositories} />
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const owner = await loginDirectory.resolve(login);
  if (!owner) notFound();

  const liffId = lineMiniApp().liffId;

  if (owner.kind === "ORGANIZATION") {
    const organization = await publicOrganizations().byLogin(owner.login);
    if (!organization) notFound();
    const repositories = await popularRepositoryProjection(owner.login);
    return (
      <ProfileViewerShell
        liffId={liffId}
        profileLogin={owner.login}
        repositoryCount={repositories.totalCount}
      >
        <ProfileContent login={owner.login} title={organization.name} repositories={repositories} />
      </ProfileViewerShell>
    );
  }

  const user = await publicUserByLogin(owner.login);
  if (!user) notFound();
  const [profile, repositories] = await Promise.all([
    profiles.publicByUserId(user.id),
    popularRepositoryProjection(owner.login),
  ]);
  return (
    <ProfileViewerShell
      liffId={liffId}
      profileLogin={owner.login}
      repositoryCount={repositories.totalCount}
    >
      <ProfileContent
        login={owner.login}
        title={profile?.displayName ?? user.login}
        bio={profile?.bio}
        repositories={repositories}
      />
    </ProfileViewerShell>
  );
}
