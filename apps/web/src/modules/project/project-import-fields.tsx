"use client";

import { useId } from "react";
import styles from "./project-import.module.css";
import type { ProjectRepositoryOption } from "./project-requests";

export type ImportIssues = "OPEN" | "CLOSED" | "ALL";
export const importLabels = {
  OPEN: "未關閉 Issues",
  CLOSED: "已關閉 Issues",
  ALL: "全部 Issues",
} as const;

export default function ProjectImportFields({
  repositories,
  repositoryId,
  onRepositoryChange,
  state,
  onStateChange,
  disabled,
}: {
  repositories: readonly ProjectRepositoryOption[];
  repositoryId: string;
  onRepositoryChange: (value: string) => void;
  state: ImportIssues;
  onStateChange: (value: ImportIssues) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.fields}>
      <p>所選儲存庫中既有及後續符合條件的 Issues，都會加入這個 Project。</p>
      <div>
        <label htmlFor={`${id}-state`}>要匯入的項目</label>
        <select
          id={`${id}-state`}
          value={state}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "OPEN" || value === "CLOSED" || value === "ALL") onStateChange(value);
          }}
          disabled={disabled}
        >
          {Object.entries(importLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-repository`}>儲存庫</label>
        <select
          id={`${id}-repository`}
          required
          value={repositoryId}
          onChange={(event) => onRepositoryChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">選擇儲存庫</option>
          {repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.ownerLogin}/{repository.name}
            </option>
          ))}
        </select>
      </div>
      {repositories.length === 0 && <p>目前沒有可讀取的儲存庫。</p>}
    </div>
  );
}
