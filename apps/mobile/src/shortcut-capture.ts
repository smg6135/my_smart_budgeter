import type { CaptureEvent } from './transaction-capture';
import { parseAmount, supportedCurrency } from './currency';
import { validDate } from './finance';

export type ShortcutInput = Record<string, string | string[] | undefined>;
// Custom scheme input is untrusted. It only creates a pending draft, never a ledger entry.
export function shortcutCapture(
  input: ShortcutInput,
  digest: string,
  now = new Date(),
): CaptureEvent {
  const get = (name: string, max: number, optional = false) => {
    const value = input[name];
    if (value === undefined && optional) return '';
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > max ||
      /[\u0000-\u001f]/.test(value)
    )
      throw new Error(`Check the Shortcut ${name} field.`);
    return value.trim();
  };
  const merchant = get('merchant', 120);
  const amount = get('amount', 30);
  const currency = get('currency', 3).toUpperCase();
  const occurredAt = get('timestamp', 40);
  if (!supportedCurrency(currency) || parseAmount(amount, currency) <= 0)
    throw new Error('The Shortcut needs a positive amount and an explicit currency such as SGD.');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) ||
    !validDate(occurredAt.slice(0, 10)) ||
    !Number.isFinite(Date.parse(occurredAt)) ||
    Date.parse(occurredAt) > now.getTime() + 5 * 60000
  )
    throw new Error(
      'The Shortcut needs the purchase timestamp in ISO 8601 format, including time zone.',
    );
  const cardLast4 = get('card', 4, true);
  if (cardLast4 && !/^\d{4}$/.test(cardLast4))
    throw new Error('Only the last four card digits may be imported.');
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Cannot verify the Shortcut import.');
  return {
    id: `shortcut:${digest}`,
    provider: 'iPhone Shortcut',
    merchant,
    amount,
    currency,
    occurredAt,
    receivedAt: now.toISOString(),
    ...(cardLast4 ? { cardLast4 } : {}),
    ...(get('reference', 64, true) ? { reference: get('reference', 64, true) } : {}),
  };
}
export function shortcutCanonical(input: ShortcutInput) {
  // Ignore router metadata, order and encoding differences when identifying a replay.
  const values = ['merchant', 'amount', 'currency', 'timestamp', 'card', 'reference'].map(
    (field) => {
      const value = input[field];
      if (value !== undefined && (typeof value !== 'string' || value.length > 160))
        throw new Error('Invalid Shortcut input.');
      return value?.trim() || '';
    },
  );
  values[2] = values[2].toUpperCase();
  // Equivalent decimal and time-zone representations identify the same delivery.
  // Full validation still happens in shortcutCapture before the draft is staged.
  try {
    values[1] = String(parseAmount(values[1], values[2]));
  } catch {}
  if (Number.isFinite(Date.parse(values[3]))) values[3] = new Date(values[3]).toISOString();
  return JSON.stringify(values);
}
export const shortcutTemplate =
  'pocketbudget://capture?merchant=MERCHANT_URL_ENCODED&amount=12.50&currency=SGD&timestamp=ISO_TIMESTAMP_URL_ENCODED';
