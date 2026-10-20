import { CirclePlus, Search } from "lucide-react";
import Link from "next/link";
import MemberAvatar from "../../../../modules/account/member-avatar";
import HomeRefresh from "./home-refresh";

export default function HomeActions({ liffId }: { liffId: string }) {
  return (
    <div className="home-heading-actions">
      <Link
        className="home-heading-action"
        href="/search"
        aria-label="Search repositories"
        title="Search"
      >
        <Search size={24} strokeWidth={1.8} aria-hidden="true" />
      </Link>

      <HomeRefresh />

      <details className="home-create-menu">
        <summary className="home-heading-action" aria-label="Create" title="Create">
          <CirclePlus size={24} strokeWidth={1.8} aria-hidden="true" />
        </summary>
        <div className="home-create-popover">
          <Link href="/repositories/new">
            <span className="home-create-icon" aria-hidden="true">
              □
            </span>
            <span>
              <strong>New Repository</strong>
              <small>建立 private Repository</small>
            </span>
          </Link>
          <Link href="/repositories?intent=create-issue">
            <span className="home-create-icon" aria-hidden="true">
              ◎
            </span>
            <span>
              <strong>Create Issue</strong>
              <small>先選擇有 write 權限的 Repository</small>
            </span>
          </Link>
        </div>
      </details>

      <MemberAvatar liffId={liffId} />
    </div>
  );
}
