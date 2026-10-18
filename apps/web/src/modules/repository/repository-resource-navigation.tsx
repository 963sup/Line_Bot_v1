import Link from "next/link";
import {
  type RepositoryResourceSection,
  repositoryResourceNavigationItems,
} from "./resource-navigation";
import styles from "./resource-navigation.module.css";

export default function RepositoryResourceNavigation({
  ownerLogin,
  repositoryName,
  active,
  canManage = false,
}: {
  ownerLogin: string;
  repositoryName: string;
  active: RepositoryResourceSection;
  canManage?: boolean;
}) {
  const items = repositoryResourceNavigationItems(ownerLogin, repositoryName, canManage);
  const secondary = items.filter((item) => item.group === "more");
  const secondaryActive = secondary.some((item) => item.section === active);
  return (
    <nav className={styles.resourceNav} aria-label="Repository resources">
      {items
        .filter((item) => item.group === "primary")
        .map((item) => (
          <Link
            key={item.section}
            className={styles.resourceLink}
            href={item.href}
            aria-current={item.section === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      <details
        className={styles.more}
        open={secondaryActive}
        key={`${ownerLogin}/${repositoryName}/${active}`}
      >
        <summary className={styles.moreSummary}>更多</summary>
        <div className={styles.secondaryLinks}>
          {secondary.map((item) => (
            <Link
              key={item.section}
              className={styles.resourceLink}
              href={item.href}
              aria-current={item.section === active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
