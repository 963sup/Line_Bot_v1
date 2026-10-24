"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import styles from "./project-list.module.css";
import { useProjectCollection } from "./use-project-collection";

type OwnerFilter = "ALL" | "USER" | "ORGANIZATION";

const ownerFilters: readonly { value: OwnerFilter; label: string }[] = [
  { value: "ALL", label: "All projects" },
  { value: "USER", label: "Personal" },
  { value: "ORGANIZATION", label: "Organization" },
];

export default function ProjectList({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useProjectCollection(liffId);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("ALL");
  const [contractHandoff, setContractHandoff] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(globalThis.window.location.search);
    const contractId = query.get("contractId") ?? "";
    const revision = query.get("contractRevisionId") ?? "";
    const owner = query.get("contractOwner") ?? "";
    const repository = query.get("contractRepository") ?? "";
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (
      uuid.test(contractId) &&
      uuid.test(revision) &&
      owner.length > 0 &&
      owner.length <= 128 &&
      repository.length > 0 &&
      repository.length <= 128
    ) {
      setContractHandoff(
        new URLSearchParams({
          contractOwner: owner,
          contractRepository: repository,
          contractId,
          contractRevisionId: revision,
        }).toString(),
      );
    }
  }, []);
  const visibleItems =
    ownerFilter === "ALL" ? items : items?.filter((item) => item.ownerKind === ownerFilter);

  return (
    <div className={`repository-list resource-workspace ${styles.collection}`}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <div className={styles.filters} role="group" aria-label="Filter projects by owner type">
        {ownerFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={ownerFilter === filter.value ? styles.activeFilter : styles.filter}
            aria-pressed={ownerFilter === filter.value}
            onClick={() => setOwnerFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.refresh}
          disabled={busy}
          onClick={() => void load()}
          aria-label="Reload projects"
          title="Reload projects"
        >
          ↻
        </button>
      </div>
      {busy && <p role="status">正在讀取 Project…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && items?.length === 0 && (
        <p className="empty-copy">目前沒有可存取的 Project。</p>
      )}
      {!busy && !error && items && items.length > 0 && visibleItems?.length === 0 && (
        <p className="empty-copy">此擁有者類型目前沒有可存取的 Project。</p>
      )}
      {visibleItems && visibleItems.length > 0 && (
        <div className={styles.list}>
          {visibleItems.map((item) => (
            <Link
              className={styles.row}
              href={
                contractHandoff
                  ? `/projects/${encodeURIComponent(item.id)}/wbs?${contractHandoff}`
                  : `/projects/${encodeURIComponent(item.id)}`
              }
              key={item.id}
            >
              <span className={styles.copy}>
                <small className={styles.owner}>{item.ownerLogin}</small>
                <strong className={styles.name}>
                  {item.number === null ? "" : `#${item.number} `}
                  {item.name}
                </strong>
              </span>
              <span className={styles.open}>
                {contractHandoff ? "選擇此 Project WBS" : "開啟"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
