import module from '../../modules/pocket-receipt-ocr';
import type { RecognizedReceipt } from '../receipt-text';
import type { ReceiptAudit } from '../receipt-audit';
import type { ScanResult } from '../api';

export const deviceOcrAvailable = module !== null;
export async function recognizeReceipt(uri: string): Promise<RecognizedReceipt> {
  if (!module) throw new Error('Install a new iOS build to use on-device OCR.');
  return module.recognize(uri);
}
export async function reviewReceiptOnDevice(
  document: RecognizedReceipt,
  draft: ScanResult,
): Promise<ReceiptAudit> {
  if (!module?.review) return { status: 'unavailable' };
  return module.review(
    JSON.stringify({ draft, text: document.lines.map((line) => line.text).join('\n') }),
  );
}
