import module from '../../modules/pocket-receipt-ocr';
import type { RecognizedReceipt } from '../receipt-text';

export const deviceOcrAvailable = module !== null;
export async function recognizeReceipt(uri: string): Promise<RecognizedReceipt> {
  if (!module) throw new Error('Install a new iOS build to use on-device OCR.');
  return module.recognize(uri);
}
