"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { repositoryPath } from "./resource-navigation";
import { useRepositoryCollection } from "./use-repository-collection";

export default function RepositorySearch({ liffId }: { liffId: string }) {
  const { items, busy, error, load, clear } = useRepositoryCollection(liffId);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const results = useMemo(
    () =>
      needle && items
        ? items.filter((item) =>
            `${item.ownerLogin}/${item.name}`.toLocaleLowerCase().includes(needle),
          )
        : [],
    [items, needle],
  );

  return (
    <div className="repository-search">
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <label className="repository-search-field">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search repositories</span>
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Search repositories"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {busy && <p role="status">正在讀取 Repository…</p>}
      {error && <p role="alert">{error}</p>}

      {!busy && !error && !needle && (
        <div className="repository-search-empty">
          <h2>Find your stuff.</h2>
          <p>搜尋你目前有權存取的 Repositories。</p>
        </div>
      )}

      {!busy && !error && needle && results.length === 0 && (
        <p className="empty-copy">找不到符合「{query.trim()}」的 Repository。</p>
      )}

      {results.length > 0 && (
        <div className="menu-group" aria-label="Repository search results">
          {results.map((item) => (
            <Link
              className="action-row"
              key={item.id}
              href={repositoryPath(item.ownerLogin, item.name)}
            >
              <span className="action-row-copy">
                <strong>
                  {item.ownerLogin}/{item.name}
                </strong>
                <small>{item.capability}</small>
              </span>
              <span className="action-chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
