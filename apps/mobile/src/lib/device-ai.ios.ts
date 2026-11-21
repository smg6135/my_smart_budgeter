import module from '../../modules/pocket-device-ai';
import {
  validateClassification,
  type Classification,
  type DeviceAiAvailability,
  type ReceiptClassification,
} from '../classification';
import type { RecognizedReceipt } from '../receipt-text';
import type { ChatResult, ScanResult } from '../api';
import type { Message } from '../finance';
const missing = 'Install the latest iOS build to use on-device AI.';
export async function deviceAiAvailability(): Promise<DeviceAiAvailability> {
  if (!module) return { available: false, reason: missing };
  return module
    .availability()
    .catch(() => ({ available: false, reason: 'On-device AI is unavailable.' }));
}
export async function classifyEntry(text: string): Promise<Classification> {
  if (!module) return { status: 'unavailable', reason: missing };
  try {
    return validateClassification(await module.classify(text.trim()));
  } catch {
    return { status: 'unavailable', reason: 'Choose a category manually.' };
  }
}
export async function classifyReceipt(
  document: RecognizedReceipt,
  draft: ScanResult,
): Promise<ReceiptClassification> {
  if (!module) return { status: 'unavailable', reason: missing };
  try {
    const output = await module.classifyReceipt(
      JSON.stringify({ draft, text: document.lines.map((line) => line.text).join('\n') }),
    );
    const classification = validateClassification(output);
    return classification.status === 'classified'
      ? {
          ...classification,
          approved: output.approved === true,
          reason: output.reason?.slice(0, 160),
        }
      : { ...classification, approved: false };
  } catch {
    return { status: 'unavailable', reason: 'Choose a category manually.' };
  }
}
export async function chatOnDevice(messages: Message[], currency: string): Promise<ChatResult> {
  if (!module) throw new Error(missing);
  // Keep complete recent turns within the local model's context; never forward to a server.
  const recent: Message[] = [];
  let length = 0;
  for (const message of messages.slice(-12).reverse()) {
    if (length + message.content.length > 4500) break;
    recent.unshift(message);
    length += message.content.length;
  }
  if (!recent.length) throw new Error('Shorten the message to use on-device AI.');
  const output = await module.chat(JSON.stringify({ messages: recent, currency }));
  if (!output || typeof output.message !== 'string' || !output.message.trim())
    throw new Error('On-device AI could not answer. Try a shorter message.');
  return { message: output.message, proposal: null, sources: [] };
}
