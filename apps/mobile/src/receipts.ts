import { ScanResult } from './api';
import { convertMinor, freshQuote, parseAmount, rateFor, supportedCurrency } from './currency';
import { Entry, State, today, validDate } from './finance';
import type { ReceiptAudit } from './receipt-audit';
export const RECEIPT_LIMIT = 20;
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];
export function receiptMime(name: string, mime?: string) {
  const normalized = mime?.split(';')[0].trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return (
    (normalized && RECEIPT_MIME_TYPES.includes(normalized) ? normalized : undefined) ||
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      pdf: 'application/pdf',
    }[name.split('.').pop()?.toLowerCase() || ''] ||
    ''
  );
}
export type ReceiptFile = { id: string; uri: string; name: string; mime: string; size?: number };
export type ReceiptDraft = {
  merchant: string;
  amount: string;
  currency: string;
  date: string;
  category: string;
  exchangeRate: string;
};
export type ReceiptJob = ReceiptFile & {
  status: 'pending' | 'processing' | 'ready' | 'error' | 'saved' | 'duplicate';
  result?: ScanResult;
  engine?: 'device' | 'cloud';
  recognizedText?: string;
  error?: string;
  reviewError?: string;
  draft?: ReceiptDraft;
  fingerprint?: string;
  audit?: ReceiptAudit;
  needsReview?: boolean;
};
export function receiptDraft(result?: ScanResult): ReceiptDraft {
  return {
    merchant: result?.merchant || '',
    amount: result && result.amount > 0 ? String(result.amount) : '',
    currency: result?.currency || '',
    date: result?.date || '',
    category: result?.category || 'Other',
    exchangeRate: '',
  };
}
export function receiptEntry(job: ReceiptJob, s: State): Entry {
  const r = job.draft || job.result;
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
    const manual = job.draft?.exchangeRate.trim();
    if (!manual && (!market || !freshQuote(s.fx))) throw new Error('Review the exchange rate.');
    const rate = manual ? Number(manual) : 1 / market!;
    amount = convertMinor(originalAmount, r.currency, s.currency, rate);
    if (amount <= 0) throw new Error('Converted amount is too small.');
    original = {
      amount: originalAmount,
      currency: r.currency,
      rate,
      fetchedAt: manual ? new Date().toISOString() : s.fx!.fetchedAt,
      source: manual ? 'Manual' : s.fx!.source,
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
    ...(job.fingerprint ? { receiptFingerprint: job.fingerprint } : {}),
  };
}

export function prepareReceiptImport(jobs: ReceiptJob[], state: State, automatic = false) {
  const entries: Entry[] = [],
    saved: string[] = [],
    duplicates: string[] = [],
    errors: Record<string, string> = {};
  const ids = new Set(state.entries.map((entry) => entry.id));
  const fingerprints = new Set(
    state.entries.map((entry) => entry.receiptFingerprint).filter(Boolean),
  );
  for (const job of jobs) {
    if (job.status !== 'ready' || (automatic && job.needsReview)) continue;
    if (ids.has(`receipt-${job.id}`) || (job.fingerprint && fingerprints.has(job.fingerprint))) {
      duplicates.push(job.id);
      continue;
    }
    try {
      const entry = receiptEntry(job, state);
      entries.push(entry);
      saved.push(job.id);
      ids.add(entry.id);
      if (entry.receiptFingerprint) fingerprints.add(entry.receiptFingerprint);
    } catch (error) {
      errors[job.id] = error instanceof Error ? error.message : 'Check receipt details.';
    }
  }
  return { entries, saved, duplicates, errors };
}

export function undoReceiptImport(
  state: State,
  imported: Entry[],
): { state: State; removed: string[] } {
  const snapshots = new Map(imported.map((entry) => [entry.id, entry]));
  const equal = (a: Entry, b: Entry) =>
    a.kind === b.kind &&
    a.amount === b.amount &&
    a.title === b.title &&
    a.category === b.category &&
    a.date === b.date &&
    a.goalId === b.goalId &&
    a.billId === b.billId &&
    a.receiptFingerprint === b.receiptFingerprint &&
    JSON.stringify(a.original) === JSON.stringify(b.original);
  const removed = state.entries
    .filter((entry) => snapshots.has(entry.id) && equal(entry, snapshots.get(entry.id)!))
    .map((entry) => entry.id);
  return {
    state: { ...state, entries: state.entries.filter((entry) => !removed.includes(entry.id)) },
    removed,
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
