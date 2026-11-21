import type { ScanResult } from './api';
import { parseReceiptText, type RecognizedReceipt } from './receipt-text';
import type { ReceiptFile } from './receipts';
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from './receipts';
import { applyReceiptAudit, clearDeviceReceipt, type ReceiptAudit } from './receipt-audit';

export type ReceiptEngine = 'device' | 'cloud';
export type ReceiptProcessing = {
  result: ScanResult;
  engine: ReceiptEngine;
  recognizedText?: string;
  audit?: ReceiptAudit;
  needsReview?: boolean;
};
export async function processReceipt(
  file: ReceiptFile,
  engine: ReceiptEngine,
  operations: {
    recognize: (uri: string) => Promise<RecognizedReceipt>;
    cloud: (file: ReceiptFile) => Promise<ScanResult>;
    review?: (document: RecognizedReceipt, draft: ScanResult) => Promise<ReceiptAudit>;
  },
): Promise<ReceiptProcessing> {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!RECEIPT_MIME_TYPES.includes(file.mime)) throw new Error('Unsupported receipt format.');
  if (engine === 'cloud') {
    const result = await operations.cloud(file);
    return { result, engine, recognizedText: undefined, needsReview: !!result.notes.trim() };
  }
  if (file.mime === 'application/pdf') throw new Error('PDF needs cloud OCR.');
  const document = await operations.recognize(file.uri);
  const draft = parseReceiptText(document);
  const audit = operations.review
    ? await operations.review(document, draft).catch(() => ({ status: 'unavailable' as const }))
    : { status: 'unavailable' as const };
  return {
    result: applyReceiptAudit(draft, audit),
    recognizedText: document.lines.map((line) => line.text).join('\n'),
    engine,
    audit,
    needsReview:
      !clearDeviceReceipt(document, draft) ||
      (audit.status === 'reviewed' && audit.approved !== true),
  };
}
