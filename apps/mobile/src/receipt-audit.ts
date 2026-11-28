import type { ScanResult } from './api';
import type { RecognizedReceipt } from './receipt-text';
import { parseReceiptText } from './receipt-text';
import { expenseCategories, type ReceiptClassification } from './classification';
import type { ReceiptExtraction } from './receipt-extraction';
export type ReceiptAudit = ReceiptClassification & { extraction?: ReceiptExtraction };
export const receiptCategories = [...expenseCategories];
// OCR confidence and financial validation are ordinary code, not an AI fallback.
export function clearDeviceReceipt(document: RecognizedReceipt, draft: ScanResult): boolean {
  const checked = parseReceiptText({
    ...document,
    lines: document.lines.filter((line) => line.confidence >= 0.85),
  });
  return (
    !!draft.merchant &&
    draft.amount > 0 &&
    !!draft.currency &&
    !!draft.date &&
    checked.merchant === draft.merchant &&
    checked.amount === draft.amount &&
    checked.currency === draft.currency &&
    checked.date === draft.date &&
    !draft.notes.trim()
  );
}
export function applyReceiptAudit(
  draft: ScanResult,
  classification: ReceiptClassification,
): ScanResult {
  return {
    ...draft,
    category: classification.status === 'classified' ? classification.category : '',
  };
}
