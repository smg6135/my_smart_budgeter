import { ScanResult } from './api';
import { convertMinor, freshQuote, parseAmount, rateFor, supportedCurrency } from './currency';
import { Entry, State, today, validDate } from './finance';
export const RECEIPT_LIMIT = 20;
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
export type ReceiptFile = { id: string; uri: string; name: string; mime: string; size?: number };
export type ReceiptJob = ReceiptFile & {
  status: 'pending' | 'processing' | 'ready' | 'error' | 'saved';
  result?: ScanResult;
  error?: string;
  reviewError?: string;
};
export function receiptEntry(job: ReceiptJob, s: State): Entry {
  const r = job.result;
  if (!r) throw new Error('Scan this receipt first.');
  if (!r.merchant.trim()) throw new Error('Enter a merchant.');
  if (!validDate(r.date) || r.date > today()) throw new Error('Review the receipt date.');
  if (!supportedCurrency(r.currency)) throw new Error('Review the receipt currency.');
  const originalAmount = parseAmount(String(r.amount), r.currency);
  if (originalAmount <= 0) throw new Error('Review the receipt amount.');
  let amount = originalAmount,
    original: Entry['original'];
  if (r.currency !== s.currency) {
    const market = rateFor(s.fx, s.currency, r.currency);
    if (!market || !freshQuote(s.fx)) throw new Error('Review the exchange rate.');
    const rate = 1 / market;
    amount = convertMinor(originalAmount, r.currency, s.currency, rate);
    if (amount <= 0) throw new Error('Converted amount is too small.');
    original = {
      amount: originalAmount,
      currency: r.currency,
      rate,
      fetchedAt: s.fx!.fetchedAt,
      source: s.fx!.source,
    };
  }
  return {
    id: `receipt-${job.id}`,
    kind: 'expense',
    title: r.merchant.trim(),
    amount,
    date: r.date,
    category: r.category,
    ...(original ? { original } : {}),
  };
}
export async function runReceiptQueue<T>(
  items: T[],
  run: (item: T) => Promise<void>,
  concurrency = 2,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await run(item);
      }
    }),
  );
}
