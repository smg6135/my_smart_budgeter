import { validatedApiUrl } from './lib/config';
import { getAccessToken } from './lib/auth';
import { FxSnapshot } from './currency';
import { State, Message } from './finance';
export type Proposal = {
  title: string;
  amount: number;
  deadline: string;
  emoji: string;
  breakdown: string[];
};
export type ChatResult = {
  message: string;
  proposal: Proposal | null;
  sources: { title: string; url: string }[];
};
export type ScanResult = {
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  notes: string;
};
export async function request<T>(s: State, path: string, body: unknown): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(validatedApiUrl(s.apiUrl) + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await getAccessToken()),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === 'string'
          ? data.detail
          : 'The request was rejected. Check your inputs.',
      );
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError')
      throw new Error('Request timed out. Please try again.');
    if (e instanceof TypeError)
      throw new Error(
        'Cannot reach the backend. Check the server URL and Wi-Fi connection in Settings.',
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export const chat = (s: State, messages: Message[]) =>
  request<ChatResult>(s, '/v1/planner/chat', {
    messages: messages.slice(-24),
    currency: s.currency,
    mode: s.aiMode || 'planning',
    research: s.research,
  });

export async function getRates(
  apiUrl: string,
  base: string,
  signal?: AbortSignal,
): Promise<FxSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(
      validatedApiUrl(apiUrl) + '/v1/fx/rates?base=' + encodeURIComponent(base),
      {
        signal: controller.signal,
        headers: { Authorization: 'Bearer ' + (await getAccessToken()) },
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === 'string' ? data.detail : 'Exchange rate service unavailable.',
      );
    if (
      data.base !== base ||
      !data.rates ||
      !Number.isFinite(data.rates[base]) ||
      Math.abs(data.rates[base] - 1) > 1e-9 ||
      !Number.isFinite(Date.parse(data.fetchedAt)) ||
      !Number.isFinite(Date.parse(data.expiresAt))
    )
      throw new Error('Exchange rate response is invalid.');
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError')
      throw new Error('Exchange rate request timed out.');
    if (e instanceof TypeError)
      throw new Error('Cannot refresh rates. Check your backend connection.');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
