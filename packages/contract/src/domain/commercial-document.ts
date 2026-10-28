import type {
  EvidenceReference,
  CommercialFieldValue as Field,
  MissingReason,
  Money,
} from "./commercial-document-values.js";

export type PricingScope = {
  scopeType: "DOCUMENT" | "SECTION" | "ROW";
  sectionId: string | null;
  rowId: string | null;
};
type ExtensionBase = {
  fieldId: string;
  label: string;
  missingReason: MissingReason | null;
  unitLabel: string | null;
  evidenceRefs: EvidenceReference[];
};
export type CommercialExtensionField = ExtensionBase &
  (
    | { valueType: "TEXT"; value: string | null }
    | { valueType: "DECIMAL"; value: string | null }
    | { valueType: "DATE"; value: string | null }
    | { valueType: "BOOLEAN"; value: boolean | null }
  );
type RowBase = {
  rowId: string;
  sectionId: string | null;
  position: number;
  evidenceRefs: EvidenceReference[];
  extensionFields: CommercialExtensionField[];
  derivedFromRowIds?: string[] | undefined;
};
export type CommercialDocumentRow = RowBase &
  (
    | {
        rowType: "ITEM";
        itemNumber: Field<string>;
        referenceCode: Field<string>;
        description: Field<string>;
        quantity: Field<string>;
        unitLabel: Field<string>;
        unitPrice: Field<Money>;
        lineAmount: Field<Money>;
        deliveryDate: Field<string>;
      }
    | {
        rowType: "CHARGE";
        chargeKind: "DISCOUNT" | "TAX" | "FREIGHT" | "ROUNDING" | "OTHER";
        scope: PricingScope;
        signedAmount: Field<Money>;
        rate: Field<string>;
        description: Field<string>;
      }
    | {
        rowType: "SUBTOTAL";
        scope: PricingScope;
        reportedAmount: Field<Money>;
        label: Field<string>;
      }
    | { rowType: "NOTE"; text: Field<string> }
  );
export type CommercialDocumentContent = {
  documentKind: "PURCHASE_ORDER" | "QUOTATION" | "ESTIMATE" | "CONTRACT" | "UNCLASSIFIED";
  header: {
    documentNumber: Field<string>;
    documentRevisionLabel: Field<string>;
    title: Field<string>;
    issueDate: Field<string>;
    validUntilDate: Field<string>;
    defaultCurrencyCode: Field<string>;
  };
  parties: {
    partyId: string;
    roles: ("ISSUER" | "RECIPIENT" | "BUYER" | "SELLER" | "OTHER")[];
    name: Field<string>;
    identifiers: {
      scheme: "TW_TAX_ID" | "VAT_ID" | "OTHER";
      label: string | null;
      value: Field<string>;
    }[];
    postalAddress: Field<string>;
    extensionFields: CommercialExtensionField[];
  }[];
  sections: {
    sectionId: string;
    parentSectionId: string | null;
    position: number;
    title: Field<string>;
    evidenceRefs: EvidenceReference[];
  }[];
  rows: CommercialDocumentRow[];
  selectionGroups: {
    selectionGroupId: string;
    label: string;
    itemRowIds: string[];
    selectionMode: "ONE_OF" | "ANY_OF" | "UNSPECIFIED";
    evidenceRefs: EvidenceReference[];
  }[];
  totals: {
    summaryId: string;
    scope: PricingScope;
    currencyCode: string | null;
    amountBasis: "TAX_EXCLUSIVE" | "TAX_INCLUSIVE" | "MIXED" | "UNSPECIFIED";
    itemsAmount: Field<string>;
    nonTaxAdjustmentsAmount: Field<string>;
    taxAmount: Field<string>;
    payableAmount: Field<string>;
    evidenceRefs: EvidenceReference[];
  }[];
  terms: {
    termId: string;
    termKind: "PAYMENT" | "DELIVERY" | "VALIDITY" | "WARRANTY" | "OTHER";
    text: Field<string>;
  }[];
  extensionFields: CommercialExtensionField[];
};

/** Identity and relationship invariants apply to every decoded commercial fact graph. */
export function validateCommercialDocumentGraph(
  content: CommercialDocumentContent,
): readonly string[] {
  const diagnostics: string[] = [];
  const fail = (message: string) => {
    diagnostics.push(message);
  };
  function unique(values: readonly string[]) {
    if (new Set(values).size !== values.length) fail("Duplicate identity.");
  }
  unique(content.parties.map((p) => p.partyId));
  unique(content.sections.map((s) => s.sectionId));
  unique(content.rows.map((r) => r.rowId));
  unique(content.selectionGroups.map((g) => g.selectionGroupId));
  unique(content.totals.map((t) => t.summaryId));
  unique(content.terms.map((t) => t.termId));
  unique(
    [
      ...content.extensionFields,
      ...content.rows.flatMap((r) => r.extensionFields),
      ...content.parties.flatMap((p) => p.extensionFields),
    ].map((e) => e.fieldId),
  );
  const sections = new Map(content.sections.map((s) => [s.sectionId, s]));
  const rows = new Map(content.rows.map((r) => [r.rowId, r]));
  // A section has one parent: settle each visited path once, without recursion.
  const settledSections = new Set<string>();
  for (const section of content.sections) {
    if (settledSections.has(section.sectionId)) continue;
    const path = new Set<string>();
    let current: string | null = section.sectionId;
    while (current !== null && !settledSections.has(current)) {
      if (path.has(current)) {
        fail("Cyclic section parent.");
        break;
      }
      path.add(current);
      const next = sections.get(current);
      if (!next) {
        fail("Unknown section parent.");
        break;
      }
      current = next.parentSectionId;
    }
    for (const id of path) settledSections.add(id);
  }
  function checkScope(scope: PricingScope) {
    if (scope.sectionId !== null && !sections.has(scope.sectionId))
      fail("Unknown pricing section.");
    if (scope.rowId !== null && rows.get(scope.rowId)?.rowType !== "ITEM")
      fail("Pricing row must reference an ITEM.");
  }
  for (const row of content.rows) {
    if (row.sectionId !== null && !sections.has(row.sectionId)) fail("Unknown row section.");
    if ("scope" in row) checkScope(row.scope);
  }
  for (const total of content.totals) checkScope(total.scope);
  for (const group of content.selectionGroups) {
    unique(group.itemRowIds);
    for (const id of group.itemRowIds)
      if (rows.get(id)?.rowType !== "ITEM") fail("Selection member must reference an ITEM.");
  }
  return diagnostics;
}

export function isValidPricingScope(scope: PricingScope): boolean {
  return scope.scopeType === "DOCUMENT"
    ? scope.sectionId === null && scope.rowId === null
    : scope.scopeType === "SECTION"
      ? scope.sectionId !== null && scope.rowId === null
      : scope.rowId !== null && scope.sectionId === null;
}
