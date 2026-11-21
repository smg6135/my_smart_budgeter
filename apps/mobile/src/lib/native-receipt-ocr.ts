import type { RecognizedReceipt } from '../receipt-text';

export const deviceOcrAvailable: boolean = false;
export async function recognizeReceipt(_uri: string): Promise<RecognizedReceipt> {
  throw new Error('On-device OCR is available in the iOS app.');
}
