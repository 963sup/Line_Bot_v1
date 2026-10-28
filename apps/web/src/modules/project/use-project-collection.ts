"use client";

import { isRecord } from "@line_bot_v1/platform/validation";
import type { ProjectSummary } from "@line_bot_v1/project/contracts/dto/project-collection";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";

export function useProjectCollection(liffId: string) {
  const [items, setItems] = useState<readonly ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setItems(null);
    setBusy(false);
    setError("");
  }, []);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const token = await liffClient.ensureSession(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/projects", {
        headers: { "X-App-Session-Generation": token },
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (!isRecord(value) || !response.ok || !Array.isArray(value.items)) {
        throw new Error(
          isRecord(value) && typeof value.error === "string"
            ? value.error
            : "Project 列表暫不可用。",
        );
      }
      const items: ProjectSummary[] = value.items.map((item) => {
        if (
          !isRecord(item) ||
          typeof item.id !== "string" ||
          typeof item.ownerLogin !== "string" ||
          (item.ownerKind !== "USER" && item.ownerKind !== "ORGANIZATION") ||
          (item.number !== null && typeof item.number !== "number") ||
          typeof item.name !== "string" ||
          typeof item.public !== "boolean" ||
          typeof item.closed !== "boolean" ||
          (item.role !== "READ" && item.role !== "WRITE" && item.role !== "ADMIN") ||
          typeof item.version !== "number"
        )
          throw new Error("Project 列表回應格式不完整。");
        return {
          id: item.id,
          ownerLogin: item.ownerLogin,
          ownerKind: item.ownerKind,
          number: item.number,
          name: item.name,
          public: item.public,
          closed: item.closed,
          role: item.role,
          version: item.version,
        };
      });
      if (ticket === generation.current) setItems(items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [liffId]);

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clear, load]);

  return { items, busy, error, load, clear };
}
