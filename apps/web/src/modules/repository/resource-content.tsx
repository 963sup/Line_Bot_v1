import Link from "next/link";
import { PageState } from "../../shared/ui/page-layout";
import {
  repositoryDiscussionPath,
  repositoryDiscussionsPath,
  repositoryMilestonesPath,
} from "./resource-navigation";
import type { PageData } from "./resource-page-model";

function dateTime(value: number) {
  return new Date(value).toLocaleString("zh-TW");
}

function swatch(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : `#${color.replaceAll("#", "")}`;
}

function milestonePath(ownerLogin: string, repositoryName: string, number: number) {
  return `${repositoryMilestonesPath(ownerLogin, repositoryName)}/${encodeURIComponent(String(number))}`;
}

export function ResourceContent({
  data,
  ownerLogin,
  repositoryName,
}: {
  data: PageData;
  ownerLogin: string;
  repositoryName: string;
}) {
  if (data.kind === "discussions") {
    if (!data.discussions.length) {
      return <PageState title="目前沒有 Discussions">這個儲存庫目前沒有可讀取的討論。</PageState>;
    }
    return (
      <ul className="notification-list">
        {data.discussions.map((discussion) => (
          <li key={discussion.id}>
            <Link
              className="notification-item"
              href={repositoryDiscussionPath(
                ownerLogin,
                repositoryName,
                discussion.id,
                discussion.number,
              )}
            >
              <span>
                <strong>{discussion.title}</strong>
                <small>
                  {discussion.category} · {discussion.author} · {dateTime(discussion.updatedAt)}
                </small>
              </span>
              <span className="notification-state">v{discussion.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (data.kind === "discussion") {
    return (
      <article className="detail-card">
        <Link className="back-link" href={repositoryDiscussionsPath(ownerLogin, repositoryName)}>
          ← 返回 Discussions
        </Link>
        <h2>{data.discussion.title}</h2>
        <p>
          {data.discussion.category} · {data.discussion.author} · v{data.discussion.version}
        </p>
        <p>{data.discussion.body}</p>
        <h3>Comments</h3>
        {!data.comments.length && <p className="empty-copy">目前沒有留言。</p>}
        <ol>
          {data.comments.map((comment) => (
            <li key={comment.id}>
              <p>{comment.body}</p>
              <small>
                {comment.author} · {dateTime(comment.createdAt)} · v{comment.version}
              </small>
            </li>
          ))}
        </ol>
      </article>
    );
  }
  if (data.kind === "labels") {
    if (!data.labels.length) {
      return <PageState title="目前沒有 Labels">這個儲存庫目前沒有可讀取的標籤。</PageState>;
    }
    return (
      <div className="discovery-list">
        {data.labels.map((label) => (
          <article className="discovery-item" key={label.id}>
            <div className="discovery-copy">
              <h2>
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: swatch(label.color),
                    display: "inline-block",
                    height: 12,
                    width: 12,
                  }}
                />{" "}
                {label.name}
              </h2>
              <p>{label.description || "沒有描述。"}</p>
              <div className="discovery-meta">
                <span>{label.color}</span>
                <span>v{label.version}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (data.kind === "milestones") {
    if (!data.milestones.length) {
      return <PageState title="目前沒有 Milestones">這個狀態下沒有可讀取的 milestone。</PageState>;
    }
    return (
      <ul className="notification-list">
        {data.milestones.map((milestone) => (
          <li key={milestone.id}>
            <Link
              className="notification-item"
              href={milestonePath(ownerLogin, repositoryName, milestone.number)}
            >
              <span>
                <strong>
                  #{milestone.number} {milestone.title}
                </strong>
                <small>
                  {milestone.status} ·{" "}
                  {milestone.dueAt ? `到期 ${dateTime(milestone.dueAt)}` : "無到期日"}
                </small>
              </span>
              <span className="notification-state">v{milestone.version}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <article className="detail-card">
      <Link className="back-link" href={repositoryMilestonesPath(ownerLogin, repositoryName)}>
        ← 返回 Milestones
      </Link>
      <h2>
        #{data.milestone.number} {data.milestone.title}
      </h2>
      <p>
        {data.milestone.status} · v{data.milestone.version}
      </p>
      <p>{data.milestone.description || "沒有描述。"}</p>
      <p>{data.milestone.dueAt ? `到期 ${dateTime(data.milestone.dueAt)}` : "無到期日"}</p>
    </article>
  );
}
