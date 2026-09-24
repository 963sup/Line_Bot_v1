"use client";
import { useEffect, useState } from "react";
import EntryResolver from "../../../shared/browser/entry-resolver";
import { hasEntryContinuation } from "../../../shared/presentation/entry-destination";

export default function PublicEntry({ liffId }: { liffId: string }) {
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    setContinuing(hasEntryContinuation(location.href));
  }, []);
  return continuing ? <EntryResolver liffId={liffId} /> : null;
}
