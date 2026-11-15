import type { ScanResult } from './api';
import { parseReceiptText, type RecognizedReceipt } from './receipt-text';
import type { ReceiptFile } from './receipts';
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from './receipts';

export type ReceiptEngine = 'device' | 'cloud';
export type ReceiptProcessing = {
  result: ScanResult;
  engine: ReceiptEngine;
  recognizedText?: string;
};
export async function processReceipt(
  file: ReceiptFile,
  engine: ReceiptEngine,
  operations: {
    recognize: (uri: string) => Promise<RecognizedReceipt>;
    cloud: (file: ReceiptFile) => Promise<ScanResult>;
  },
): Promise<ReceiptProcessing> {
  if ((file.size || 0) > RECEIPT_MAX_BYTES) throw new Error('File exceeds 8 MB.');
  if (!RECEIPT_MIME_TYPES.includes(file.mime)) throw new Error('Unsupported receipt format.');
  if (engine === 'cloud')
    return { result: await operations.cloud(file), engine, recognizedText: undefined };
  if (file.mime === 'application/pdf') throw new Error('PDF needs cloud OCR.');
  const document = await operations.recognize(file.uri);
  return {
    result: parseReceiptText(document),
    recognizedText: document.lines.map((line) => line.text).join('\n'),
    engine,
  };
}
