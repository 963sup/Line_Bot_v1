import Link from "next/link";
import { notFound } from "next/navigation";
import { repositoryPath } from "../../../modules/repository/resource-navigation";
import { lineMiniApp } from "../../../shared/server/line-mini-app";
import { profiles, publicUserById } from "../../api/_composition/account.server";
import { resolveAccountNamespace } from "../../api/_composition/namespace.server";
import ProfileViewerShell from "../_components/profile-viewer-shell";
import { publicOrganizations } from "../_composition/directory.server";
import { publicRepositories } from "../_composition/repository.server";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

async function popularRepositoryProjection(login: string) {
  return publicRepositories().popularByOwner(login, 6);
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

export default async function Page({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const owner = await resolveAccountNamespace(login);
  if (!owner) notFound();

  const liffId = lineMiniApp().liffId;

  if (owner.kind === "ORGANIZATION") {
    const [organization, repositories] = await Promise.all([
      publicOrganizations().byLogin(owner.login),
      popularRepositoryProjection(owner.login),
    ]);
    if (!organization) notFound();
    return (
      <ProfileViewerShell
        key={`${owner.kind}:${owner.id}:${owner.login}`}
        liffId={liffId}
        profileKind="ORGANIZATION"
        profileLogin={owner.login}
        profileTitle={organization.name}
        repositoryCount={repositories.totalCount}
      >
        <PopularRepositories repositories={repositories} />
      </ProfileViewerShell>
    );
  }

  const [user, profile, repositories] = await Promise.all([
    publicUserById(owner.id),
    profiles.publicByUserId(owner.id),
    popularRepositoryProjection(owner.login),
  ]);
  if (!user || user.login !== owner.login) notFound();
  return (
    <ProfileViewerShell
      key={`${owner.kind}:${owner.id}:${owner.login}`}
      liffId={liffId}
      profileBio={profile?.bio}
      profileKind="USER"
      profileLogin={owner.login}
      profileTitle={profile?.displayName ?? user.login}
      profileUserId={owner.id}
      repositoryCount={repositories.totalCount}
    >
      <PopularRepositories repositories={repositories} />
    </ProfileViewerShell>
  );
}
