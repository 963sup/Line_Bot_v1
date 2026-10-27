import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PurchaseOrderReview from "../src/modules/file/purchase-order-review";

test("purchase-order review exposes commercial facts and uncertainty before attestation", () => {
  const html = renderToStaticMarkup(
    createElement(PurchaseOrderReview, {
      candidate: {
        header: {
          documentNumber: "PO-123",
          revision: "A",
          issueDate: "2026-10-27",
          title: "Equipment",
          currency: "TWD",
        },
        buyer: { name: "Buyer", registrationNumber: "12345678" },
        seller: { name: "Seller", registrationNumber: "87654321" },
        lines: [
          {
            sourceRowId: "row-1",
            itemNumber: "1",
            category: "material",
            materialCode: "MAT-42",
            description: "<script>test</script>",
            quantity: "2",
            unit: "EA",
            unitPrice: "100.25",
            grossAmount: "200.50",
            discountAmount: "10.50",
            netAmount: "190.00",
            deliveryDate: "2026-11-01",
            sourcePages: [1, 2],
            uncertain: true,
          },
        ],
        totals: { gross: "200.50", discount: "10.50", net: "190.00", tax: "9.50", total: "199.50" },
        terms: { text: "Payment within 30 days", sourcePages: [2] },
        fieldEvidence: {
          "header.documentNumber": [{ sourcePages: [1], rawText: "PO-123", confidence: "0.95" }],
        },
        corrections: [
          {
            field: "lines.row-1.unit",
            original: "piece",
            replacement: "EA",
            reason: "unit normalization",
          },
        ],
      },
    }),
  );
  for (const value of [
    "PO-123",
    "Buyer",
    "Seller",
    "12345678",
    "MAT-42",
    "100.25",
    "10.50",
    "199.50",
    "2026-11-01",
    "Payment within 30 days",
    "尚待釐清",
    "單價",
    "折扣",
    "應付總額",
    "unit normalization",
    "0.95",
  ])
    assert.ok(html.includes(value), `review must expose ${value}`);
  assert.ok(html.includes("&lt;script&gt;test&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
});
