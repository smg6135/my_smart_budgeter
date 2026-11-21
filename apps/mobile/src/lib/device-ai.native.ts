import { Platform, TurboModuleRegistry } from 'react-native';
import native from '../../modules/pocket-device-ai';
import {
  validateClassification,
  type Classification,
  type DeviceAiAvailability,
  type ReceiptClassification,
} from '../classification';
import type { RecognizedReceipt } from '../receipt-text';
import type { ChatResult, ScanResult } from '../api';
import type { Message } from '../finance';
import { modelStore } from './local-model.native';
import { localModel } from '../local-model';
import {
  categoryMessages,
  categorySchema,
  readCategory,
  receiptReviewMessages,
  receiptReviewSchema,
  chatInstructions,
  type LocalMessage,
} from '../local-ai-prompts';
import type { LlamaContext } from 'llama.rn';

const missing = 'Install the latest mobile build to use local AI.';
const runtimePresent = () => !!native && !!TurboModuleRegistry.get('RNLlama');
let systemCheck: Promise<DeviceAiAvailability> | undefined;
async function systemAvailability(): Promise<DeviceAiAvailability> {
  if (!native) return { available: false, reason: missing };
  if (!systemCheck) {
    systemCheck = native.availability().catch(() => ({ available: false }));
    setTimeout(() => {
      systemCheck = undefined;
    }, 5000);
  }
  return systemCheck;
}
export async function deviceAiAvailability(): Promise<DeviceAiAvailability> {
  const system = await systemAvailability();
  if (system.available)
    return {
      available: true,
      provider: 'system',
      model: Platform.OS === 'ios' ? 'Apple Intelligence' : 'Gemini Nano',
    };
  if (!runtimePresent()) return { available: false, reason: missing };
  // Start acquisition without making the UI wait for a large download.
  void modelStore.ensure();
  const state = modelStore.getSnapshot();
  return {
    available: state.status === 'ready',
    provider: 'downloaded',
    model: localModel.name,
    download: state.status,
    progress: state.progress,
    reason:
      state.status === 'downloading'
        ? `Installing local AI · ${Math.round(state.progress * 100)}%`
        : state.reason,
  };
}
export const subscribeDeviceAi = modelStore.subscribe;
export const downloadDeviceAi = () => modelStore.ensure(true, true);
export const pauseDeviceAi = () => modelStore.pause();

let context: LlamaContext | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
export function suspendDeviceAi() {
  if (idle) clearTimeout(idle);
  // Stop outstanding generation before releasing model memory in background.
  void context?.stopCompletion().catch(() => {});
  void serial(async () => {
    const previous = context;
    context = undefined;
    await previous?.release();
  }).catch(() => {});
}
async function generate(messages: LocalMessage[], schema?: object): Promise<string> {
  return serial(async () => {
    if (idle) clearTimeout(idle);
    const system = await systemAvailability();
    if (Platform.OS === 'android' && system.available && native?.generate) {
      const output = await native.generate(
        JSON.stringify({
          instructions: messages[0].content,
          messages: messages.slice(1),
          ...(schema ? { responseSchema: schema } : {}),
        }),
      );
      return output.trim();
    }
    const path = await modelStore.path();
    try {
      if (!context) {
        const { initLlama } = await import('llama.rn');
        context = await initLlama({
          model: path,
          n_ctx: 2048,
          n_batch: 128,
          n_ubatch: 128,
          n_gpu_layers: 0,
          n_threads: 2,
          use_mmap: true,
          use_mlock: false,
        });
      }
      const format = schema
        ? { type: 'json_schema' as const, json_schema: { strict: true, schema } }
        : undefined;
      const options = {
        jinja: true,
        chat_template_kwargs: { enable_thinking: false },
        response_format: format,
      };
      const formatted = await context.getFormattedChat(messages, undefined, options);
      const tokens = await context.tokenize(formatted.prompt);
      if (tokens.tokens.length > 1700)
        throw new Error('Shorten the description or message to use local AI.');
      const output = await context.completion({
        messages,
        ...options,
        temperature: 0,
        seed: 42,
        n_predict: schema ? 48 : 192,
        stop: ['<|im_end|>', '<|endoftext|>'],
      });
      if (output.truncated || output.stopped_limit)
        throw new Error('Local AI could not finish. Try a shorter message.');
      return output.text.trim();
    } finally {
      idle = setTimeout(suspendDeviceAi, 60000);
    }
  });
}
export async function classifyEntry(text: string): Promise<Classification> {
  if (!text.trim() || text.length > 1000)
    return { status: 'needs-input', reason: 'Enter a short description or choose a category.' };
  try {
    const availability = await deviceAiAvailability();
    if (!availability.available)
      return { status: 'unavailable', reason: availability.reason || missing };
    if (availability.provider === 'system' && Platform.OS === 'ios' && native)
      return validateClassification(await native.classify(text.trim()));
    return readCategory(await generate(categoryMessages(text), categorySchema));
  } catch {
    return { status: 'unavailable', reason: 'Choose a category manually.' };
  }
}
export async function classifyReceipt(
  document: RecognizedReceipt,
  draft: ScanResult,
): Promise<ReceiptClassification> {
  try {
    let availability = await deviceAiAvailability();
    // A receipt uploaded during first installation waits for that same download.
    if (
      !availability.available &&
      availability.provider === 'downloaded' &&
      ['waiting', 'downloading', 'verifying'].includes(availability.download || '')
    ) {
      await modelStore.ensure();
      availability = await deviceAiAvailability();
    }
    if (!availability.available)
      return { status: 'unavailable', reason: availability.reason || missing };
    if (availability.provider === 'system' && Platform.OS === 'ios' && native) {
      const output = await native.classifyReceipt(
        JSON.stringify({ draft, text: document.lines.map((line) => line.text).join('\n') }),
      );
      const category = validateClassification(output);
      return category.status === 'classified'
        ? { ...category, approved: output.approved === true, reason: output.reason?.slice(0, 160) }
        : { ...category, approved: false };
    }
    const category = readCategory(
      await generate(
        categoryMessages(document.lines.map((line) => line.text).join('\n')),
        categorySchema,
      ),
    );
    if (category.status !== 'classified') return { ...category, approved: false };
    // Financial validation in receipt-processor remains mandatory, independent of this AI review.
    const review = JSON.parse(
      await generate(receiptReviewMessages(document, draft), receiptReviewSchema),
    );
    return { ...category, approved: review.approved === true };
  } catch {
    return { status: 'unavailable', reason: 'Check the receipt details.', approved: false };
  }
}
export async function chatOnDevice(messages: Message[], currency: string): Promise<ChatResult> {
  const availability = await deviceAiAvailability();
  if (!availability.available) throw new Error(availability.reason || missing);
  const recent: LocalMessage[] = [];
  let length = 0;
  const limit = availability.provider === 'system' && Platform.OS === 'ios' ? 4500 : 2800;
  for (const message of messages.slice(-12).reverse()) {
    if (length + message.content.length > limit) break;
    recent.unshift({ role: message.role, content: message.content });
    length += message.content.length;
  }
  if (!recent.length) throw new Error('Shorten the message to use local AI.');
  const message =
    availability.provider === 'system' && Platform.OS === 'ios' && native
      ? (await native.chat(JSON.stringify({ messages: recent, currency }))).message
      : await generate([
          { role: 'system', content: `${chatInstructions} User currency: ${currency}.` },
          ...recent,
        ]);
  if (!message?.trim()) throw new Error('Local AI could not answer. Try a shorter message.');
  return { message, proposal: null, sources: [] };
}
