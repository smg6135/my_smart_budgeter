import { CURRENCIES, supportedCurrency, FxSnapshot } from './currency';
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
export async function getRates(base: string, signal?: AbortSignal): Promise<FxSnapshot> {
  if (!supportedCurrency(base)) throw new Error('Unsupported currency.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(
      'https://api.coinbase.com/v2/exchange-rates?currency=' + encodeURIComponent(base),
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error('Exchange rates unavailable. Enter a rate manually.');
    const data = (await response.json()).data;
    if (
      data?.currency !== base ||
      !data.rates ||
      Math.abs(Number(data.rates[base]) - 1) > 1e-9 ||
      !Number.isFinite(Number(data.rates[base]))
    )
      throw new Error('Exchange rate response is invalid.');
    const rates: Record<string, number> = {};
    for (const code of CURRENCIES) {
      const rate = Number(data.rates[code]);
      if (Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    const fetchedAt = new Date();
    return {
      base,
      rates,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: new Date(fetchedAt.getTime() + 5 * 60000).toISOString(),
      source: 'Coinbase',
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError')
      throw new Error('Exchange rate request timed out.');
    if (e instanceof TypeError) throw new Error('Cannot refresh rates. Enter a rate manually.');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
