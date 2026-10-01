"use client";
import { useCallback, useEffect, useState } from "react";
import { resolveVerifiedProfileEntry } from "../../../modules/account/profile-entry-client";
import EntryResolver from "../../../shared/browser/entry-resolver";
import { hasEntryContinuation } from "../../../shared/presentation/entry-destination";

export default function PublicEntry({
  liffId,
  initialContinuing = false,
}: {
  liffId: string;
  initialContinuing?: boolean;
}) {
  const [continuing, setContinuing] = useState(initialContinuing);
  useEffect(() => {
    if (!initialContinuing) setContinuing(hasEntryContinuation(location.href));
  }, [initialContinuing]);
  const resolveRedirect = useCallback(
    async (target: string, signal: AbortSignal) => {
      if (target !== "/profile") return target;
      try {
        const result = await resolveVerifiedProfileEntry(liffId, signal);
        if (result.kind === "waiting") return null;
        return result.kind === "redirect" ? result.href : "/profile";
      } catch {
        return signal.aborted ? null : "/profile";
      }
    },
    [liffId],
  );
  return continuing ? <EntryResolver liffId={liffId} resolveRedirect={resolveRedirect} /> : null;
}
