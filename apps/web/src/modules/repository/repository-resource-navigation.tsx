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
  return (
    <nav className={styles.resourceNav} aria-label="Repository resources">
      {repositoryResourceNavigationItems(ownerLogin, repositoryName, canManage).map((item) => (
        <Link
          key={item.section}
          className={styles.resourceLink}
          href={item.href}
          aria-current={item.section === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
