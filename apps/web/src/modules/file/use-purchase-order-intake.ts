"use client";

import { useCallback, useState } from "react";
import type { FileInfo, Pending, View } from "./files-projection";
import { StaleRequest, errorMessage, record } from "./files-projection";
import {
  type DocumentIntakeCommand,
  type DocumentIntakeReceipt,
  type DocumentIntakeRevision,
  candidateLines,
  parseDocumentIntakeReceipt,
  parseDocumentIntakeRevision,
  sourceReviewPages,
} from "./purchase-order-intake-view";

/** ContractDocument UI lifecycle is separate from File's source and upload ownership. */
export function usePurchaseOrderIntake({
  view, selected, setSelected, pending, busy, setBusy, setError, epoch,
  mutationLock, requestDocumentIntake,
}: {
  view: View | null;
  selected: FileInfo | null;
  setSelected(value: FileInfo | null): void;
  pending: Pending | null;
  busy: boolean;
  setBusy(value: boolean): void;
  setError(value: string): void;
  epoch: { current: number };
  mutationLock: { current: boolean };
  requestDocumentIntake(query: Record<string, string>, command?: object): Promise<unknown>;
}) {
  const [documentIntakeReceipt, setDocumentIntakeReceipt] = useState<DocumentIntakeReceipt | null>(
    null,
  );
  const [documentIntakeRevision, setDocumentIntakeRevision] =
    useState<DocumentIntakeRevision | null>(null);
  const [sourceReviewConfirmed, setSourceReviewConfirmed] = useState(false);
  const [acknowledgementReason, setAcknowledgementReason] = useState("");
  const [pendingDocumentConfirmation, setPendingDocumentConfirmation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [pendingDocumentIntake, setPendingDocumentIntake] = useState<DocumentIntakeCommand | null>(
    null,
  );

  const clearPurchaseOrder = useCallback(() => {
    setDocumentIntakeReceipt(null);
    setDocumentIntakeRevision(null);
    setSourceReviewConfirmed(false);
    setAcknowledgementReason("");
    setPendingDocumentConfirmation(null);
    setPendingDocumentIntake(null);
  }, []);

  async function intakePurchaseOrder(command: DocumentIntakeCommand) {
    if (!view?.canEdit || pending || busy || pendingDocumentConfirmation || mutationLock.current)
      return;
    mutationLock.current = true;
    const ticket = epoch.current;
    const file = view.files.find((item) => item.fileId === command.source.fileId);
    if (file) setSelected(file);
    setPendingDocumentIntake(command);
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const receipt = parseDocumentIntakeReceipt(
        await requestDocumentIntake({ operation: "intake" }, command),
      );
      if (ticket !== epoch.current) return;
      if (receipt.requestId !== command.requestId || receipt.documentId !== command.documentId)
        throw new Error("Contract 草稿回執不符，請使用原命令重試。");
      saved = true;
      setDocumentIntakeReceipt(receipt);
      const revision = parseDocumentIntakeRevision(
        record(
          await requestDocumentIntake({
            operation: "read",
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          }),
        ).revision,
      );
      if (ticket !== epoch.current) return;
      if (
        revision.documentId !== receipt.documentId ||
        revision.revisionId !== receipt.revisionId ||
        revision.source.fileId !== command.source.fileId ||
        revision.source.fileRevisionId !== command.source.fileRevisionId ||
        revision.source.fileSha256 !== command.source.fileSha256
      )
        throw new Error("Contract 草稿來源不符，請使用原命令重新查核。");
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setAcknowledgementReason("");
      setPendingDocumentConfirmation(null);
      setPendingDocumentIntake(null);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 503;
      if (!saved && status >= 400 && status < 500 && status !== 409 && status !== 429)
        setPendingDocumentIntake(null);
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) {
        setBusy(false);
        mutationLock.current = false;
      }
    }
  }

  async function confirmPurchaseOrder() {
    if (
      !view?.canEdit ||
      !documentIntakeReceipt ||
      !documentIntakeRevision ||
      busy ||
      pending ||
      mutationLock.current
    )
      return;
    if (documentIntakeRevision.state !== "DRAFT") return;
    if (!sourceReviewConfirmed) {
      setError("請先逐行核對原始檔，再確認採購單。");
      return;
    }
    const lines = candidateLines(documentIntakeRevision.candidate);
    const reviewedSourcePages = sourceReviewPages(documentIntakeRevision.candidate);
    if (reviewedSourcePages.length === 0) {
      setError("候選資料缺少完整行數或來源頁，不能確認。");
      return;
    }
    const command =
      pendingDocumentConfirmation ??
      (() => {
        const financialDiagnostic = documentIntakeRevision.diagnostics.some((item) =>
          item.includes("MISMATCH"),
        );
        if (financialDiagnostic && !acknowledgementReason.trim()) {
          setError("存在金額差異，請填寫明確的差異確認理由。");
          return null;
        }
        return {
          action: "confirm",
          repositoryId: view.repository.id,
          documentId: documentIntakeRevision.documentId,
          requestId: crypto.randomUUID(),
          intentFingerprint: documentIntakeReceipt.intentFingerprint,
          expectedVersion: documentIntakeRevision.version,
          source: documentIntakeRevision.source,
          candidate: documentIntakeRevision.candidate,
          sourceReviewAttestation: {
            verifiedLineCount: lines.length,
            reviewedSourcePages,
            reviewedSourceRowIds: lines.map((line) => line.sourceRowId),
            confirmedFromOriginal: true,
          },
          ...(financialDiagnostic
            ? { acknowledgement: { reason: acknowledgementReason.trim() } }
            : {}),
        };
      })();
    if (!command) return;
    mutationLock.current = true;
    const ticket = epoch.current;
    setPendingDocumentConfirmation(command);
    setBusy(true);
    setError("");
    try {
      const receipt = parseDocumentIntakeReceipt(
        await requestDocumentIntake(
          { operation: "contract", documentId: documentIntakeRevision.documentId },
          command,
        ),
      );
      const revision = parseDocumentIntakeRevision(
        record(
          await requestDocumentIntake({
            operation: "read",
            documentId: receipt.documentId,
            revisionId: receipt.revisionId,
          }),
        ).revision,
      );
      if (ticket !== epoch.current) return;
      if (
        receipt.requestId !== command.requestId ||
        receipt.documentId !== command.documentId ||
        revision.documentId !== receipt.documentId ||
        revision.revisionId !== receipt.revisionId
      )
        throw new Error("Contract 確認回執不符，請使用原命令重試。");
      setDocumentIntakeReceipt(receipt);
      setDocumentIntakeRevision(revision);
      setSourceReviewConfirmed(false);
      setPendingDocumentConfirmation(null);
    } catch (cause) {
      if (cause instanceof StaleRequest || ticket !== epoch.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : 503;
      if (status >= 400 && status < 500 && status !== 409 && status !== 429)
        setPendingDocumentConfirmation(null);
      setError(errorMessage(cause));
    } finally {
      if (ticket === epoch.current) {
        setBusy(false);
        mutationLock.current = false;
      }
    }
  }

  function startPurchaseOrderIntake(file = selected) {
    if (
      !view?.canEdit ||
      !file ||
      pending ||
      busy ||
      pendingDocumentIntake ||
      pendingDocumentConfirmation ||
      mutationLock.current
    )
      return;
    setDocumentIntakeReceipt(null);
    setDocumentIntakeRevision(null);
    setPendingDocumentConfirmation(null);
    setSourceReviewConfirmed(false);
    setAcknowledgementReason("");
    void intakePurchaseOrder({
      action: "save",
      repositoryId: view.repository.id,
      documentId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      expectedVersion: 0,
      source: {
        fileId: file.fileId,
        fileRevisionId: file.revisionId,
        fileSha256: file.sha256,
      },
    });
  }


  return {
    documentIntakeReceipt, setDocumentIntakeReceipt,
    documentIntakeRevision, setDocumentIntakeRevision,
    sourceReviewConfirmed, setSourceReviewConfirmed,
    acknowledgementReason, setAcknowledgementReason,
    pendingDocumentConfirmation, setPendingDocumentConfirmation,
    pendingDocumentIntake, setPendingDocumentIntake,
    clearPurchaseOrder,
    intakePurchaseOrder, confirmPurchaseOrder, startPurchaseOrderIntake,
  };
}
