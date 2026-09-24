/** Uncertain model output remains nullable for explicit human confirmation. */
export interface ReceiptReading {
  isReceipt: boolean;
  merchant: string | null;
  date: string | null;
  amount: string | null;
  currency: string | null;
  invoiceNumber: string | null;
  uncertainFields: string[];
}
