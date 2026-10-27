"use client";

import { useEffect, useRef } from "react";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Label } from "../../shared/ui/label";
import {
  candidateLines,
  type DocumentIntakeRevision,
  diagnosticLabels,
} from "./purchase-order-intake-view";
import PurchaseOrderReview from "./purchase-order-review";

/** ContractDocument review UI owns only review presentation and local focus, not File facts. */
export default function PurchaseOrderIntakeReview({
  revision,
  sourceReviewConfirmed,
  setSourceReviewConfirmed,
  acknowledgementReason,
  setAcknowledgementReason,
  pendingDocumentConfirmation,
  busy,
  pending,
  confirmPurchaseOrder,
}: {
  revision: DocumentIntakeRevision;
  sourceReviewConfirmed: boolean;
  setSourceReviewConfirmed(value: boolean): void;
  acknowledgementReason: string;
  setAcknowledgementReason(value: string): void;
  pendingDocumentConfirmation: Record<string, unknown> | null;
  busy: boolean;
  pending: boolean;
  confirmPurchaseOrder(): Promise<void>;
}) {
  const review = useRef<HTMLDivElement>(null);
  useEffect(() => {
    review.current?.focus();
  }, []);
  return (
    <div
      ref={review}
      tabIndex={-1}
      role="region"
      aria-label="採購單審核"
      className="grid min-w-0 gap-3 rounded-md border p-3"
    >
      <div>
        <p className="font-medium">採購單審核</p>
        <p className="text-xs text-muted-foreground">
          {revision.state === "CONFIRMED"
            ? "採購單已確認並保存。"
            : `候選 v${revision.version} · 系統辨識 ${candidateLines(revision.candidate).length} 筆明細`}
        </p>
      </div>
      {revision.diagnostics.length > 0 && (
        <p className="text-sm text-destructive">
          {revision.diagnostics
            .map((code) => diagnosticLabels[code] ?? `需核對：${code}`)
            .join("；")}
        </p>
      )}
      <PurchaseOrderReview candidate={revision.candidate} />
      {revision.state === "DRAFT" && (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={sourceReviewConfirmed}
              disabled={busy || pending || pendingDocumentConfirmation !== null}
              onChange={(event) => setSourceReviewConfirmed(event.target.checked)}
            />
            <span>我已核對原始檔、全部明細、來源頁與金額，確認以上採購單資料正確。</span>
          </label>
          {revision.diagnostics.some((item) => item.includes("MISMATCH")) && (
            <div className="grid gap-2">
              <Label htmlFor="purchase-order-acknowledgement">金額差異確認理由</Label>
              <Input
                id="purchase-order-acknowledgement"
                placeholder="請說明接受此金額差異的原因"
                value={acknowledgementReason}
                disabled={busy || pending || pendingDocumentConfirmation !== null}
                onChange={(event) => setAcknowledgementReason(event.target.value)}
              />
            </div>
          )}
          <Button
            disabled={busy || pending || (!pendingDocumentConfirmation && !sourceReviewConfirmed)}
            onClick={() => void confirmPurchaseOrder()}
          >
            {pendingDocumentConfirmation ? "以原請求重試確認" : "確認採購單"}
          </Button>
        </>
      )}
    </div>
  );
}
