"use client";

import {
  isRepositorySummary,
  isStarredRepository,
} from "@line_bot_v1/repository/contracts/parse-collection-response";
import { useCallback, useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import { errorMessage, isRecord } from "./response-validation";

function useCollection<T>(
  liffId: string,
  path: string,
  isItem: (value: unknown) => value is T,
  unavailable: string,
) {
  const [items, setItems] = useState<T[] | null>(null);
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
      const response = await fetch(path, {
        headers: { "X-App-Session-Generation": token },
        cache: "no-store",
      });
      const value: unknown = await response.json();
      if (
        !response.ok ||
        !isRecord(value) ||
        !Array.isArray(value.items) ||
        !value.items.every(isItem)
      ) {
        throw new Error(errorMessage(value, unavailable));
      }
      if (ticket === generation.current) setItems(value.items);
    } catch (cause) {
      if (ticket === generation.current) {
        setItems(null);
        setError(cause instanceof Error ? cause.message : unavailable);
      }
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }, [isItem, liffId, path, unavailable]);

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

export function useRepositoryCollection(liffId: string) {
  return useCollection(
    liffId,
    "/api/repositories",
    isRepositorySummary,
    "Repository 列表暫不可用。",
  );
}

export function useStarredRepositoryCollection(liffId: string) {
  return useCollection(
    liffId,
    "/api/repositories/starred",
    isStarredRepository,
    "收藏的儲存庫暫不可用。",
  );
}
