import type { ScanResult } from './api';
import type { RecognizedReceipt } from './receipt-text';
import { parseReceiptText } from './receipt-text';

export type ReceiptAudit = {
  status: 'reviewed' | 'unavailable';
  approved?: boolean;
  category?: string;
  reason?: string;
};
export const receiptCategories = [
  'Food & drinks',
  'Groceries',
  'Transport',
  'Shopping',
  'Health',
  'Entertainment',
  'Other',
];

// Auto-add requires the same financial fields to survive a stricter OCR confidence cutoff.
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

export function applyReceiptAudit(draft: ScanResult, audit: ReceiptAudit): ScanResult {
  // The language model can classify or flag a draft; it cannot rewrite money, dates or currencies.
  return {
    ...draft,
    category:
      audit.status === 'reviewed' && audit.category && receiptCategories.includes(audit.category)
        ? audit.category
        : draft.category,
  };
}
