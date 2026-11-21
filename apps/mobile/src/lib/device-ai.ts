import type {
  Classification,
  DeviceAiAvailability,
  ReceiptClassification,
} from '../classification';
import type { RecognizedReceipt } from '../receipt-text';
import type { ChatResult, ScanResult } from '../api';
import type { Message } from '../finance';
const reason =
  'On-device AI is available in the iOS app on supported Apple Intelligence devices, or through a local model in the mobile app.';
export const subscribeDeviceAi = (_listener: () => void) => () => {};
export const downloadDeviceAi = async () => {};
export const pauseDeviceAi = async () => {};
export const suspendDeviceAi = () => {};
export async function deviceAiAvailability(): Promise<DeviceAiAvailability> {
  return { available: false, reason };
}
export async function classifyEntry(_text: string): Promise<Classification> {
  return { status: 'unavailable', reason };
}
export async function classifyReceipt(
  _document: RecognizedReceipt,
  _draft: ScanResult,
): Promise<ReceiptClassification> {
  return { status: 'unavailable', reason };
}
export async function chatOnDevice(_messages: Message[], _currency: string): Promise<ChatResult> {
  throw new Error(reason);
}
