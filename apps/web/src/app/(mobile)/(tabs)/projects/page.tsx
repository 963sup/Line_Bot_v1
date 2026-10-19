import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import Link from "next/link";
import ProjectList from "../../../../modules/project/project-list";
import { PageHeading } from "../../../../shared/ui/page-layout";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PageHeading
        title="Projects"
        back="/home"
        actions={
          <Link
            className="home-heading-action"
            href="/projects/new"
            aria-label="建立 Project"
            title="建立 Project"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </Link>
        }
      />
      <ProjectList liffId={lineMiniApp().liffId} />
    </>
  );
}
