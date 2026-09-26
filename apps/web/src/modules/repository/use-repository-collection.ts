"use client";

import type { RepositorySummary } from "@line-work/repository/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";

export function useRepositoryCollection(liffId: string) {
  const [items, setItems] = useState<RepositorySummary[] | null>(null);
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
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const response = await fetch("/api/repositories", {
        headers: { "x-line-token": token },
        cache: "no-store",
      });
      const value = (await response.json()) as { items?: RepositorySummary[]; error?: string };
      if (!response.ok || !Array.isArray(value.items)) {
        throw new Error(value.error ?? "Repository 列表暫不可用。");
      }
      if (ticket === generation.current) setItems(value.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : "Repository 列表暫不可用。");
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
