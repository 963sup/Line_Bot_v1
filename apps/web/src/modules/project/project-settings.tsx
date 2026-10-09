"use client";

import type {
  ProjectManagementCommand,
  ProjectManagementView,
} from "@line_bot_v1/project/contracts/management";
import { useEffect, useState } from "react";

type ProjectForm = Readonly<{
  title: string;
  shortDescription: string;
  readme: string;
  public: boolean;
}>;

export default function ProjectSettings({
  data,
  busy,
  pending,
  send,
}: {
  data: ProjectManagementView;
  busy: boolean;
  pending: boolean;
  send: (command: ProjectManagementCommand, successMessage: string) => void;
}) {
  const [form, setForm] = useState<ProjectForm>(() => ({
    title: data.project.title,
    shortDescription: data.project.shortDescription,
    readme: data.project.readme,
    public: data.project.public,
  }));

  useEffect(() => {
    setForm({
      title: data.project.title,
      shortDescription: data.project.shortDescription,
      readme: data.project.readme,
      public: data.project.public,
    });
  }, [data.project]);

  const changed =
    form.title.trim() !== data.project.title ||
    form.shortDescription.trim() !== data.project.shortDescription ||
    form.readme !== data.project.readme ||
    form.public !== data.project.public;

  return (
    <section className="crud-detail">
      <div className="crud-section-head">
        <div>
          <h2>Project 設定</h2>
          <p>名稱、說明與可見性由 Project owner 管理。</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || pending}
          onClick={() =>
            send(
              {
                action: data.project.closed ? "reopen-project" : "close-project",
                requestId: crypto.randomUUID(),
                projectId: data.project.id,
                expectedVersion: data.project.version,
              },
              data.project.closed ? "Project 已重新開啟。" : "Project 已關閉。",
            )
          }
        >
          {data.project.closed ? "重新開啟 Project" : "關閉 Project"}
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(
            {
              action: "update-project",
              requestId: crypto.randomUUID(),
              projectId: data.project.id,
              expectedVersion: data.project.version,
              title: form.title.trim(),
              shortDescription: form.shortDescription.trim(),
              readme: form.readme,
              public: form.public,
            },
            "Project 設定已更新。",
          );
        }}
      >
        <label>
          Project 名稱
          <input
            required
            maxLength={160}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            disabled={busy || pending}
          />
        </label>
        <label>
          簡介
          <textarea
            maxLength={500}
            rows={2}
            value={form.shortDescription}
            onChange={(event) => setForm({ ...form, shortDescription: event.target.value })}
            disabled={busy || pending}
          />
        </label>
        <label>
          Project 說明
          <textarea
            maxLength={20_000}
            rows={4}
            value={form.readme}
            onChange={(event) => setForm({ ...form, readme: event.target.value })}
            disabled={busy || pending}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.public}
            onChange={(event) => setForm({ ...form, public: event.target.checked })}
            disabled={busy || pending}
          />
          公開 Project（只增加 Project 讀取，不授予來源 Repository / Issue 權限）
        </label>
        <button disabled={busy || pending || !form.title.trim() || !changed}>
          儲存 Project 設定
        </button>
      </form>
    </section>
  );
}
