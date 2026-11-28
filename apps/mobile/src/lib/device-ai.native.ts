import {
  runReceiptAi,
  receiptExtractionSchema,
  type ReceiptAiResult,
  type ReceiptAiStage,
} from '../receipt-extraction';
import { categoryRequest } from '../category-prompt';
import { expenseCategories } from '../classification';
import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import { AiLifecycle, stopLocalCompletion } from '../ai-lifecycle';
import native from '../../modules/pocket-device-ai';
import { type Classification, type DeviceAiAvailability } from '../classification';
import type { RecognizedReceipt } from '../receipt-text';
import type { ChatResult, ScanResult } from '../api';
import type { Message } from '../finance';
import { modelStore } from './local-model.native';
import { localModel } from '../local-model';
import { receiptReviewSchema, chatInstructions, type LocalMessage } from '../local-ai-prompts';
import type { LlamaContext } from 'llama.rn';
import { localCompletionText, localGenerationOptions } from '../local-model-output';

const missing = 'Install the latest mobile build to use local AI.';
const runtimePresent = () => !!native && !!TurboModuleRegistry.get('RNLlama');
let systemCheck: Promise<DeviceAiAvailability> | undefined;
async function systemAvailability(): Promise<DeviceAiAvailability> {
  if (process.env.EXPO_PUBLIC_LOCAL_AI_SMOKE === '1') return { available: false };
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

const lifecycle = new AiLifecycle(
  () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
);
let context: LlamaContext | undefined;
let stopping: Promise<unknown> = Promise.resolve();
let smokeTrace: unknown;
export const deviceAiSmokeTrace = () => smokeTrace;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
export function suspendDeviceAi() {
  lifecycle.interrupt();
  if (idle) clearTimeout(idle);
  // Stop outstanding generation before releasing model memory in background.
  const running = context;
  if (running) stopping = stopLocalCompletion(() => running.stopCompletion());
  void serial(async () => {
    const previous = context;
    context = undefined;
    await stopping;
    await previous?.release();
  }).catch(() => {});
}
// Own lifecycle handling here, including calls outside the availability hook.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') suspendDeviceAi();
});
AppState.addEventListener('memoryWarning', suspendDeviceAi);

async function generate(messages: LocalMessage[], schema?: object): Promise<string> {
  const check = lifecycle.checkpoint();
  return serial(async () => {
    check();
    if (idle) clearTimeout(idle);
    const system = await systemAvailability();
    check();
    if (system.available && native?.generate) {
      const output = await native.generate(
        JSON.stringify({
          instructions: messages[0].content,
          messages: messages.slice(1),
          ...(schema ? { responseSchema: schema } : {}),
        }),
      );
      check();
      return output.trim();
    }
    const path = await modelStore.path();
    check();
    try {
      if (!context) {
        const { initLlama } = await import('llama.rn');
        check();
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
      check();
      const format = schema
        ? { type: 'json_schema' as const, json_schema: { strict: true, schema } }
        : undefined;
      const options = { ...localGenerationOptions, response_format: format };
      const formatted = await context.getFormattedChat(messages, undefined, options);
      check();
      const tokens = await context.tokenize(formatted.prompt);
      check();
      if (tokens.tokens.length > 1700)
        throw new Error('Shorten the description or message to use local AI.');
      const output = await context.completion({
        messages,
        ...options,
        temperature: 0,
        seed: 42,
        n_predict:
          schema === receiptExtractionSchema
            ? 256
            : schema === receiptReviewSchema
              ? 128
              : schema
                ? 48
                : 192,
        stop: ['<|im_end|>', '<|endoftext|>'],
      });
      check();
      if (process.env.EXPO_PUBLIC_LOCAL_AI_SMOKE === '1') {
        smokeTrace = {
          prompt: formatted.prompt,
          format: formatted.type,
          raw: output.text,
          content: output.content,
          reasoning: output.reasoning_content,
          truncated: output.truncated,
          stopped_limit: output.stopped_limit,
        };
      }
      return localCompletionText(output);
    } finally {
      try {
        check();
        idle = setTimeout(suspendDeviceAi, 60000);
      } catch {
        // Initialization can finish after the background stop found no context.
        const previous = context;
        context = undefined;
        await stopping;
        await previous?.release();
      }
    }
  });
}
export async function classifyEntry(
  text: string,
  categories: string[] = [...expenseCategories],
): Promise<Classification> {
  if (!text.trim() || text.length > 1000)
    return { status: 'needs-input', reason: 'Enter a short description or choose a category.' };
  try {
    const check = lifecycle.checkpoint();
    const availability = await deviceAiAvailability();
    check();
    if (!availability.available)
      return { status: 'unavailable', reason: availability.reason || missing };
    const request = categoryRequest(text, categories);
    return request.read(await generate(request.messages, request.schema));
  } catch {
    return { status: 'unavailable', reason: 'Choose a category manually.' };
  }
}
export async function classifyReceipt(
  document: RecognizedReceipt,
  draft: ScanResult,
  categories: string[] = [...expenseCategories],
  onStage?: (stage: ReceiptAiStage) => void,
): Promise<ReceiptAiResult> {
  try {
    const check = lifecycle.checkpoint();
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
    check();
    if (!availability.available)
      return { status: 'unavailable', reason: availability.reason || missing };
    return await runReceiptAi(document, draft, categories, generate, check, onStage);
  } catch {
    return { status: 'unavailable', reason: 'Check the receipt details.', approved: false };
  }
}
export async function chatOnDevice(messages: Message[], currency: string): Promise<ChatResult> {
  const check = lifecycle.checkpoint();
  const availability = await deviceAiAvailability();
  check();
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
  check();
  if (!message?.trim()) throw new Error('Local AI could not answer. Try a shorter message.');
  return { message, proposal: null, sources: [] };
}
