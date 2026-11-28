import { ScanResult } from './api';
import { convertMinor, freshQuote, parseAmount, rateFor, supportedCurrency } from './currency';
import { Entry, State, today, validDate } from './finance';
import type { ReceiptAudit } from './receipt-audit';
import { isExpenseCategory, activeCategories } from './classification';
import { captureCandidates, type CaptureRecord } from './transaction-capture';
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
  title?: string;
  detail?: string;
  merchant: string;
  amount: string;
  currency: string;
  date: string;
  category: string;
  exchangeRate: string;
};
export type ReceiptJob = ReceiptFile & {
  stage?: 'ocr' | 'extracting' | 'categorizing';
  status: 'pending' | 'processing' | 'ready' | 'error' | 'saved' | 'duplicate';
  result?: ScanResult;
  engine?: 'device';
  recognizedText?: string;
  error?: string;
  reviewError?: string;
  draft?: ReceiptDraft;
  fingerprint?: string;
  audit?: ReceiptAudit;
  needsReview?: boolean;
  linkedEntryId?: string;
};
export const receiptFingerprints = (entry: Entry) => [
  ...new Set(
    [entry.receiptFingerprint, ...(entry.receiptFingerprints || [])].filter(
      (v): v is string => !!v,
    ),
  ),
];

export function receiptPurchaseMatches(job: ReceiptJob, state: State) {
  const draft = job.draft || job.result;
  if (!draft || !validDate(draft.date)) return [];
  const record: CaptureRecord = {
    id: `receipt:${job.id}`,
    sourceIds: [],
    providers: ['Receipt'],
    merchant: draft.merchant,
    amount: String(draft.amount),
    currency: draft.currency,
    receivedAt: `${draft.date}T12:00:00Z`,
    occurredAt: `${draft.date}T12:00:00Z`,
    kind: 'purchase',
    status: 'pending',
  };
  return captureCandidates(state, record).filter((match) => match.type === 'entry');
}
export function linkReceiptPurchase(state: State, job: ReceiptJob, entryId: string): State {
  if (
    job.status !== 'ready' ||
    !job.fingerprint ||
    !state.entries.some((e) => e.id === entryId && e.kind === 'expense')
  )
    throw new Error('This receipt or expense is no longer available for linking.');
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.id !== entryId
        ? entry
        : {
            ...entry,
            receiptFingerprints: [...new Set([...receiptFingerprints(entry), job.fingerprint!])],
          },
    ),
  };
}
export function receiptDraft(result?: ScanResult): ReceiptDraft {
  return {
    title: result?.title || result?.merchant || '',
    detail: result?.detail || '',
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
  if ((r.title && r.title.length > 120) || (r.detail && r.detail.length > 240))
    throw new Error('Keep the title under 121 characters and detail under 241 characters.');
  if (!isExpenseCategory(r.category, activeCategories(s))) throw new Error('Choose a category.');
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
    title: (r.title || r.merchant).trim(),
    ...(r.detail ? { detail: r.detail.trim() } : {}),
    receiptMerchant: r.merchant.trim(),
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
  const fingerprints = new Set(state.entries.flatMap(receiptFingerprints));
  for (const job of jobs) {
    if (job.status !== 'ready' || (automatic && job.needsReview)) continue;
    if (ids.has(`receipt-${job.id}`) || (job.fingerprint && fingerprints.has(job.fingerprint))) {
      duplicates.push(job.id);
      continue;
    }
    try {
      const entry = receiptEntry(job, state);
      if (
        automatic &&
        receiptPurchaseMatches(job, { ...state, entries: [...entries, ...state.entries] }).length
      ) {
        errors[job.id] =
          'Possible existing purchase. Link this receipt or confirm it is a separate expense.';
        continue;
      }
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
    a.detail === b.detail &&
    a.receiptMerchant === b.receiptMerchant &&
    a.category === b.category &&
    a.date === b.date &&
    a.goalId === b.goalId &&
    a.billId === b.billId &&
    a.receiptFingerprint === b.receiptFingerprint &&
    JSON.stringify(a.receiptFingerprints) === JSON.stringify(b.receiptFingerprints) &&
    JSON.stringify(a.capture) === JSON.stringify(b.capture) &&
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
