import type { RecognizedReceipt } from '../receipt-text';
import type { ReceiptAudit } from '../receipt-audit';
import type { ScanResult } from '../api';

export const deviceOcrAvailable: boolean = false;
export async function recognizeReceipt(_uri: string): Promise<RecognizedReceipt> {
  throw new Error('On-device OCR is available in the iOS app.');
}
export async function reviewReceiptOnDevice(
  _document: RecognizedReceipt,
  _draft: ScanResult,
): Promise<ReceiptAudit> {
  return { status: 'unavailable' };
}
