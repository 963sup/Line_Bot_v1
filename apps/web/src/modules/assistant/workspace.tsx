"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import {
  assistantSurfaceConfig,
  assistantSurfaceModes,
  type AssistantSurfaceMode,
} from "./web-surface";

export default function AssistantWorkspace({ liffId }: { liffId: string }) {
  const [mode, setMode] = useState<AssistantSurfaceMode>("ask");
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const config = assistantSurfaceConfig[mode];

  function clearPrivateState() {
    generation.current++;
    setReady(false);
    setBusy(false);
    setResult("");
    setError("");
  }

  function changeMode(nextMode: AssistantSurfaceMode) {
    generation.current++;
    setMode(nextMode);
    setBusy(false);
    setResult("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value || busy) return;

    const ticket = ++generation.current;
    setBusy(true);
    setResult("");
    setError("");
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "x-line-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode, input: value }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || typeof payload.text !== "string") {
        throw new Error(payload.error ?? "AI 暫時不可用。");
      }
      if ((await liffClient.session(liffId)) !== token || ticket !== generation.current) return;
      setResult(payload.text);
    } catch (cause) {
      if (ticket === generation.current) {
        setError(cause instanceof Error ? cause.message : "AI 暫時不可用。");
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  return (
    <div className="assistant-workspace" aria-labelledby="assistant-mode-title">
      <MiniAppRuntime
        liffId={liffId}
        onReady={() => setReady(true)}
        onWait={clearPrivateState}
      />
      <div className="assistant-tabs" role="tablist" aria-label="AI 模式">
        {assistantSurfaceModes.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => changeMode(item)}
          >
            {assistantSurfaceConfig[item].label}
          </button>
        ))}
      </div>

      <div className="assistant-mode-copy">
        <h2 id="assistant-mode-title">{config.label}</h2>
        <p>{config.description}</p>
      </div>

      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="assistant-input">內容</label>
        <textarea
          id="assistant-input"
          value={input}
          maxLength={config.maxLength}
          rows={7}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === "ask"
              ? "例如：幫我整理今天要處理的工作"
              : mode === "generate"
                ? "描述要整理成 Issue draft 的工作"
                : "貼上要檢視的工作內容"
          }
        />
        <div className="assistant-form-footer">
          <span>
            {input.length}/{config.maxLength}
          </span>
          <button type="submit" disabled={!ready || busy || !input.trim()}>
            {busy ? "處理中…" : config.submitLabel}
          </button>
        </div>
      </form>

      <p className="assistant-boundary">
        AI output 是建議或草稿，不會直接修改 Repository、Issue、Expense 或其他正式資料。
      </p>

      {error && (
        <p className="assistant-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <article className="assistant-result" aria-live="polite">
          <h2>Result</h2>
          <p>{result}</p>
        </article>
      )}
    </div>
  );
}
