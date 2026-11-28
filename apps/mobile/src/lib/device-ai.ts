import type { ReceiptAiStage } from '../receipt-extraction';
import type {
  Classification,
  DeviceAiAvailability,
  ReceiptClassification,
} from '../classification';
import type { RecognizedReceipt } from '../receipt-text';
import type { ChatResult, ScanResult } from '../api';
import type { Message } from '../finance';
const reason = 'AI unavailable on this device.';
export const subscribeDeviceAi = (_listener: () => void) => () => {};
export const downloadDeviceAi = async () => {};
export const pauseDeviceAi = async () => {};
export const suspendDeviceAi = () => {};
export async function deviceAiAvailability(): Promise<DeviceAiAvailability> {
  return { available: false, reason };
}
export async function classifyEntry(
  _text: string,
  _categories?: string[],
): Promise<Classification> {
  return { status: 'unavailable', reason };
}
export async function classifyReceipt(
  _document: RecognizedReceipt,
  _draft: ScanResult,
  _categories?: string[],
  _onStage?: (stage: ReceiptAiStage) => void,
): Promise<ReceiptClassification> {
  return { status: 'unavailable', reason };
}
export async function chatOnDevice(_messages: Message[], _currency: string): Promise<ChatResult> {
  throw new Error(reason);
}
