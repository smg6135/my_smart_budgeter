import type { ScanResult } from './api';
import { parseReceiptText, type RecognizedReceipt } from './receipt-text';
import type { ReceiptFile } from './receipts';
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from './receipts';
import { applyReceiptAudit, clearDeviceReceipt, type ReceiptAudit } from './receipt-audit';
import { extractedReceiptDraft } from './receipt-extraction';
import { receiptReviewMatches } from './local-ai-prompts';
export type ReceiptProcessing = {
  result: ScanResult;
  engine: 'device';
  recognizedText: string;
  audit: ReceiptAudit;
  needsReview: boolean;
};
export async function processReceipt(
  file: ReceiptFile,
  operations: {
    recognize: (uri: string) => Promise<RecognizedReceipt>;
    classify: (document: RecognizedReceipt, draft: ScanResult) => Promise<ReceiptAudit>;
  },
): Promise<ReceiptProcessing> {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!RECEIPT_MIME_TYPES.includes(file.mime)) throw new Error('Unsupported receipt format.');
  if (file.mime === 'application/pdf')
    throw new Error('Choose a receipt photo. PDF scanning is not available on-device.');
  const document = await operations.recognize(file.uri);
  const draft = parseReceiptText(document);
  const audit: ReceiptAudit = await operations
    .classify(document, draft)
    .catch(() => ({ status: 'unavailable' as const, reason: 'Choose a category manually.' }));
  return {
    result: applyReceiptAudit(
      audit.extraction ? extractedReceiptDraft(draft, audit.extraction) : draft,
      audit,
    ),
    recognizedText: document.lines.map((line) => line.text).join('\n'),
    engine: 'device',
    audit,
    needsReview:
      !clearDeviceReceipt(document, draft) ||
      (!!audit.extraction && !receiptReviewMatches(JSON.stringify(audit.extraction), draft)) ||
      audit.status !== 'classified' ||
      audit.approved !== true,
  };
}
