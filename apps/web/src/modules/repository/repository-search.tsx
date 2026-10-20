"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { Empty, EmptyDescription, EmptyHeader } from "../../shared/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../shared/ui/input-group";
import { ActionRow } from "../../shared/ui/page-layout";
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
    <>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <InputGroup className="mb-6 h-11">
        <InputGroupInput
          autoFocus
          type="search"
          aria-label="Search repositories"
          className="h-full"
          value={query}
          placeholder="Search repositories"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
      </InputGroup>

      {busy && <p role="status">正在讀取 Repository…</p>}
      {error && <p role="alert">{error}</p>}

      {!busy && !error && !needle && (
        <Empty className="min-h-[52vh]">
          <EmptyHeader>
            <h2 className="m-0 text-[28px]">Find your stuff.</h2>
            <EmptyDescription>搜尋你目前有權存取的 Repositories。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!busy && !error && needle && results.length === 0 && (
        <p className="empty-copy">找不到符合「{query.trim()}」的 Repository。</p>
      )}

      {results.length > 0 && (
        <div className="menu-group" aria-label="Repository search results">
          {results.map((item) => (
            <ActionRow
              key={item.id}
              href={repositoryPath(item.ownerLogin, item.name)}
              title={`${item.ownerLogin}/${item.name}`}
              description={item.permissions.join(", ")}
            />
          ))}
        </div>
      )}
    </>
  );
}
