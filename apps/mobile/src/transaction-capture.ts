import type { Entry, State } from './finance';
import { id, validDate } from './finance';
import {
  parseAmount,
  supportedCurrency,
  formatMoney,
  convertMinor,
  freshQuote,
  rateFor,
} from './currency';
import { isExpenseCategory, activeCategories } from './classification';

export type CaptureEvent = {
  id: string;
  provider: string;
  receivedAt: string;
  text?: string;
  merchant?: string;
  amount?: string;
  currency?: string;
  occurredAt?: string;
  cardLast4?: string;
  reference?: string;
};
export type CaptureRecord = {
  id: string;
  sourceIds: string[];
  providers: string[];
  receivedAt: string;
  occurredAt: string;
  merchant: string;
  amount: string;
  currency: string;
  cardLast4?: string;
  reference?: string;
  kind: 'purchase' | 'refund' | 'unknown';
  status: 'pending' | 'added' | 'linked' | 'ignored';
  entryId?: string;
};
export type CaptureEvidence = {
  sourceIds: string[];
  providers: string[];
  occurredAt: string;
  cardLast4?: string;
  reference?: string;
};
export type CaptureSettings = { packages: string[] };
export type CaptureEdit = {
  merchant: string;
  amount: string;
  currency: string;
  date: string;
  category: string;
};
export const captureApps = [
  { packageName: 'com.dbs.sg.dbsmbanking', label: 'DBS digibank' },
  { packageName: 'com.dbs.sg.posbmbanking', label: 'POSB digibank' },
  { packageName: 'com.americanexpress.android.acctsvcs.sg', label: 'Amex Singapore' },
  { packageName: 'com.americanexpress.android.acctsvcs.us', label: 'Amex US' },
  { packageName: 'com.google.android.apps.walletnfcrel', label: 'Google Wallet' },
] as const;
const securityAlert =
  /\b(?:otp|one[ -]time|verification code|security code|passcode|password|sign[ -]?in|log[ -]?in|authenticate)\b/i;
const notPurchase =
  /\b(?:declined|unsuccessful|failed|payment due|minimum payment|statement ready)\b/i;
const purchaseCue = /\b(?:paid|purchase|spent|charged|payment|transaction)\b/i;
const balanceOnly = /\b(?:available balance|credit limit)\b/i;
const refunds = /\b(?:refund(?:ed)?|reversed|reversal|cancelled|canceled)\b/i;
const key = (text: string) =>
  text
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
const safeText = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const safeReference = (value: unknown) => {
  const text = safeText(value, 64);
  // Avoid retaining full card/account numbers as transaction references.
  return /^[A-Za-z0-9_-]{4,64}$/.test(text) && !/^\d{8,}$/.test(text) ? text : undefined;
};
export function captureDate(record: Pick<CaptureRecord, 'occurredAt'>): string {
  const date = new Date(record.occurredAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseCaptureEvent(event: CaptureEvent): CaptureRecord | null {
  if (
    !event ||
    typeof event.id !== 'string' ||
    !/^[A-Za-z0-9:._-]{1,220}$/.test(event.id) ||
    !timestamp(event.receivedAt) ||
    !safeText(event.provider, 80)
  )
    return null;
  const text = safeText(event.text, 1600);
  if (
    securityAlert.test(text) ||
    notPurchase.test(text) ||
    (balanceOnly.test(text) && !purchaseCue.test(text))
  )
    return null;
  const found = [
    ...text.matchAll(
      /\b([A-Z]{3})\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)\b|\b([0-9][0-9,]*(?:\.[0-9]{1,3})?)\s*([A-Z]{3})\b|S\$\s*([0-9][0-9,]*(?:\.[0-9]{1,3})?)/g,
    ),
  ]
    .map((m) => ({ currency: m[1] || m[4] || 'SGD', amount: m[2] || m[3] || m[5] }))
    .filter((v) => /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,3})?$/.test(v.amount))
    .map((v) => ({ ...v, amount: v.amount.replace(/,/g, '') }))
    .filter((v) => supportedCurrency(v.currency));
  const unique = [...new Map(found.map((v) => [`${v.currency}:${v.amount}`, v])).values()];
  const financial = unique.length === 1 ? unique[0] : undefined;
  const currency =
    typeof event.currency === 'string' && supportedCurrency(event.currency)
      ? event.currency
      : financial?.currency || '';
  const amount = safeText(event.amount, 30) || financial?.amount || '';
  let merchant =
    safeText(event.merchant, 120) ||
    safeText(
      text.match(/\bat\s+(.+?)(?=\s+(?:on|using|with card|ref(?:erence)?|txn)\b|[.;]|$)/i)?.[1],
      120,
    );
  // Never store long card/account numbers in the merchant field.
  merchant = merchant.replace(/\d(?:[ -]?\d){7,}/g, '[redacted]');
  const suffix =
    event.cardLast4 || text.match(/(?:ending(?: in)?|\*{2,}|[xX]{2,})\s*(\d{4})\b/i)?.[1];
  return {
    id: event.id,
    sourceIds: [event.id],
    providers: [safeText(event.provider, 80)],
    receivedAt: event.receivedAt,
    occurredAt: timestamp(event.occurredAt) ? event.occurredAt : event.receivedAt,
    merchant,
    amount,
    currency,
    ...(suffix && /^\d{4}$/.test(suffix) ? { cardLast4: suffix } : {}),
    ...(safeReference(event.reference) ? { reference: safeReference(event.reference) } : {}),
    kind: refunds.test(text)
      ? 'refund'
      : purchaseCue.test(text) || event.amount
        ? 'purchase'
        : 'unknown',
    status: 'pending',
  };
}
const knownIds = (state: State) =>
  new Set([
    ...(state.captures || []).flatMap((r) => r.sourceIds),
    ...state.entries.flatMap((e) => e.capture?.sourceIds || []),
  ]);
export function receiveCaptures(state: State, events: CaptureEvent[]): State {
  const known = knownIds(state);
  const records = [...(state.captures || [])];
  let changed = false;
  for (const event of events.slice(0, 200)) {
    if (known.has(event.id)) continue;
    const record = parseCaptureEvent(event);
    if (!record || records.filter((r) => r.status === 'pending').length >= 100) continue;
    records.push(record);
    known.add(event.id);
    changed = true;
  }
  // Keep resolved replay tombstones; they contain normalized fields, not raw notifications.
  return changed ? { ...state, captures: records } : state;
}
export function receiveSingleCapture(state: State, event: CaptureEvent): State {
  if (
    !knownIds(state).has(event.id) &&
    parseCaptureEvent(event) &&
    (state.captures || []).filter((r) => r.status === 'pending').length >= 100
  )
    throw new Error('The purchase inbox is full. Review existing alerts before importing another.');
  return receiveCaptures(state, [event]);
}
export function captureCandidates(state: State, record: CaptureRecord) {
  const candidates: { id: string; type: 'entry' | 'capture'; title: string; reason: string }[] = [];
  const merchant = key(record.merchant);
  let amount: number | undefined;
  try {
    amount = parseAmount(record.amount, record.currency);
  } catch {}
  const comparable =
    merchant.length >= 2 &&
    supportedCurrency(record.currency) &&
    amount !== undefined &&
    amount > 0;
  for (const entry of state.entries) {
    if (entry.kind !== 'expense') continue;
    const currency = entry.original?.currency || state.currency;
    const value = entry.original?.amount ?? entry.amount;
    const sameReference =
      !!record.reference &&
      entry.capture?.reference === record.reference &&
      record.providers.some((p) => entry.capture?.providers.includes(p));
    if (sameReference) {
      candidates.push({
        id: entry.id,
        type: 'entry',
        title: entry.title,
        reason: 'Same reference; confirm before linking.',
      });
      continue;
    }
    if (!comparable || key(entry.receiptMerchant || entry.title) !== merchant) continue;
    const close = entry.capture
      ? Math.abs(Date.parse(entry.capture.occurredAt) - Date.parse(record.occurredAt)) <=
        24 * 3600000
      : entry.date === captureDate(record);
    if (close && currency === record.currency && value === amount)
      candidates.push({
        id: entry.id,
        type: 'entry',
        title: entry.title,
        reason: 'Same merchant, amount and currency near this date.',
      });
    else if (
      close &&
      entry.capture &&
      Math.abs(Date.parse(entry.capture.occurredAt) - Date.parse(record.occurredAt)) <= 10 * 60000
    )
      candidates.push({
        id: entry.id,
        type: 'entry',
        title: entry.title,
        reason:
          'Nearby purchase; amount or currency differs. Check tips, FX or authorization changes.',
      });
  }
  for (const other of state.captures || []) {
    if (other.id === record.id || other.status !== 'pending') continue;
    const gap = Math.abs(Date.parse(other.occurredAt) - Date.parse(record.occurredAt));
    let otherAmount = -1;
    try {
      otherAmount = parseAmount(other.amount, other.currency);
    } catch {}
    const sameReference =
      !!record.reference &&
      other.reference === record.reference &&
      record.providers.some((p) => other.providers.includes(p));
    if (!sameReference && (!comparable || key(other.merchant) !== merchant)) continue;
    if (
      sameReference ||
      (gap <= 24 * 3600000 && other.currency === record.currency && otherAmount === amount) ||
      gap <= 10 * 60000
    )
      candidates.push({
        id: other.id,
        type: 'capture',
        title: other.merchant,
        reason: sameReference
          ? 'Same reference; confirm whether these are one purchase.'
          : otherAmount === amount && other.currency === record.currency
            ? 'Possible wallet/bank duplicate. Two real purchases can also match.'
            : 'Nearby alert with a different amount or currency; review before combining.',
      });
  }
  return candidates;
}
export function combineCaptures(state: State, sourceId: string, targetId: string): State {
  const source = state.captures?.find((r) => r.id === sourceId && r.status === 'pending');
  const target = state.captures?.find((r) => r.id === targetId && r.status === 'pending');
  if (!source || !target || source.id === target.id)
    throw new Error('These alerts can no longer be combined.');
  if ((source.kind === 'refund') !== (target.kind === 'refund'))
    throw new Error('Review refund/reversal alerts separately from purchase alerts.');
  return {
    ...state,
    captures: state
      .captures!.filter((r) => r.id !== sourceId)
      .map((r) =>
        r.id !== targetId
          ? r
          : {
              ...r,
              sourceIds: [...new Set([...r.sourceIds, ...source.sourceIds])],
              providers: [...new Set([...r.providers, ...source.providers])],
            },
      ),
  };
}
export function resolveCapture(state: State, recordId: string, entryId?: string): State {
  const record = state.captures?.find((r) => r.id === recordId && r.status === 'pending');
  if (!record) throw new Error('This alert has already been reviewed.');
  const entry = entryId
    ? state.entries.find((e) => e.id === entryId && e.kind === 'expense')
    : undefined;
  if (entryId && !entry) throw new Error('That expense no longer exists.');
  const evidence: CaptureEvidence = {
    sourceIds: [...new Set([...(entry?.capture?.sourceIds || []), ...record.sourceIds])],
    providers: [...new Set([...(entry?.capture?.providers || []), ...record.providers])],
    occurredAt: entry?.capture?.occurredAt || record.occurredAt,
    cardLast4: entry?.capture?.cardLast4 || record.cardLast4,
    reference: entry?.capture?.reference || record.reference,
  };
  return {
    ...state,
    entries: state.entries.map((e) => (e.id === entry?.id ? { ...e, capture: evidence } : e)),
    captures: state.captures!.map((r) =>
      r.id === recordId
        ? { ...r, status: entry ? 'linked' : 'ignored', ...(entry ? { entryId: entry.id } : {}) }
        : r,
    ),
  };
}
export function addCapturedExpense(state: State, recordId: string, edit: CaptureEdit): State {
  const record = state.captures?.find((r) => r.id === recordId && r.status === 'pending');
  if (!record) throw new Error('This alert has already been reviewed.');
  if (record.kind === 'refund')
    throw new Error('Refund/reversal alerts require a manual ledger correction.');
  if (
    !edit.merchant.trim() ||
    edit.merchant.length > 120 ||
    !supportedCurrency(edit.currency) ||
    !validDate(edit.date) ||
    !isExpenseCategory(edit.category, activeCategories(state))
  )
    throw new Error('Check the merchant, currency, date and category.');
  const value = parseAmount(edit.amount, edit.currency);
  if (value <= 0) throw new Error('Enter a positive purchase amount.');
  let amount = value;
  let original: Entry['original'];
  if (edit.currency !== state.currency) {
    const forward = freshQuote(state.fx)
      ? rateFor(state.fx, state.currency, edit.currency)
      : undefined;
    const rate = forward ? 1 / forward : undefined;
    if (!rate)
      throw new Error(
        'Refresh exchange rates or add this purchase manually with an explicit rate.',
      );
    amount = convertMinor(value, edit.currency, state.currency, rate);
    if (amount <= 0) throw new Error('Converted amount is too small.');
    original = {
      amount: value,
      currency: edit.currency,
      rate,
      source: state.fx!.source,
      fetchedAt: state.fx!.fetchedAt,
    };
  }
  const entry: Entry = {
    id: `capture-${id()}`,
    kind: 'expense',
    title: edit.merchant.trim(),
    amount,
    date: edit.date,
    category: edit.category,
    ...(original ? { original } : {}),
    capture: {
      sourceIds: record.sourceIds,
      providers: record.providers,
      occurredAt: record.occurredAt,
      cardLast4: record.cardLast4,
      reference: record.reference,
    },
  };
  const linked = resolveCapture(
    { ...state, entries: [entry, ...state.entries] },
    recordId,
    entry.id,
  );
  return {
    ...linked,
    captures: linked.captures!.map((r) => (r.id === recordId ? { ...r, status: 'added' } : r)),
  };
}
export function captureEdit(record: CaptureRecord): CaptureEdit {
  return {
    merchant: record.merchant,
    amount: record.amount,
    currency: record.currency,
    date: captureDate(record),
    category: '',
  };
}
export function entryCaptureAmount(entry: Entry, base: string) {
  const currency = entry.original?.currency || base;
  return formatMoney(entry.original?.amount ?? entry.amount, currency, true);
}
