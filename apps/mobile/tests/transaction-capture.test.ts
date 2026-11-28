import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, type State } from '../src/finance';
import {
  addCapturedExpense,
  captureCandidates,
  combineCaptures,
  parseCaptureEvent,
  receiveCaptures,
  receiveSingleCapture,
  resolveCapture,
  type CaptureEvent,
} from '../src/transaction-capture';
import { shortcutCanonical, shortcutCapture } from '../src/shortcut-capture';
import {
  linkReceiptPurchase,
  prepareReceiptImport,
  receiptEntry,
  undoReceiptImport,
  type ReceiptJob,
} from '../src/receipts';

const time = '2026-11-22T12:00:00+08:00';
const event = (id: string, changes: Partial<CaptureEvent> = {}): CaptureEvent => ({
  id,
  provider: 'DBS digibank',
  receivedAt: time,
  text: 'Your card ending 1234 was charged SGD 12.50 at Corner Cafe on 22 Nov 2026.',
  ...changes,
});
const edit = {
  merchant: 'Corner Cafe',
  amount: '12.50',
  currency: 'SGD',
  category: 'Food & drinks',
  date: '2026-11-22',
};
const staged = (...events: CaptureEvent[]) => receiveCaptures({ ...initialState }, events);

test('a full inbox keeps native events queued and rejects a new manual import without rejecting replays', () => {
  const state = staged(...Array.from({ length: 100 }, (_, i) => event(`full-${i}`)));
  assert.equal(state.captures?.length, 100);
  assert.equal(receiveCaptures(state, [event('overflow')]), state);
  assert.throws(() => receiveSingleCapture(state, event('overflow')), /inbox is full/);
  assert.equal(receiveSingleCapture(state, event('full-0')), state);
  const cleared = resolveCapture(state, 'full-0');
  assert.equal(receiveSingleCapture(cleared, event('overflow')).captures?.length, 101);
});

test('capture parses printed financial evidence, discards raw text and requires explicit currency', () => {
  const record = parseCaptureEvent(event('a'))!;
  assert.equal(record.amount, '12.50');
  assert.equal(record.merchant, 'Corner Cafe');
  assert.equal(record.currency, 'SGD');
  assert.equal(record.cardLast4, '1234');
  const withBalance = parseCaptureEvent(
    event('balance', { text: 'Paid SGD 12.50 at Corner Cafe; available balance SGD 900.00' }),
  );
  assert(withBalance);
  assert.equal(withBalance.amount, ''); // Do not confuse balance with the charge.
  assert.equal(
    parseCaptureEvent(event('balance-only', { text: 'Available balance SGD 900.00' })),
    null,
  );
  assert(!JSON.stringify(record).includes('was charged'));
  assert.equal(parseCaptureEvent(event('b', { text: 'Paid $12.50 at Corner Cafe' }))!.currency, '');
  assert.equal(parseCaptureEvent(event('c', { text: 'Paid SGD 1,23 at Corner Cafe' }))!.amount, '');
  assert.equal(
    parseCaptureEvent(event('d', { text: 'Paid SGD 12.50 at Corner Cafe; total SGD 20.00' }))!
      .amount,
    '',
  );
  assert.equal(
    parseCaptureEvent(event('e', { text: 'Paid S$1,234.50 at Corner Cafe' }))!.amount,
    '1234.50',
  );
});

test('OTP, login and declined alerts are never retained; full numbers are redacted', () => {
  for (const text of [
    'OTP 123456 to approve SGD 12.50',
    'Your login SGD 12.50',
    'Payment SGD 12.50 declined',
  ])
    assert.equal(parseCaptureEvent(event('a', { text })), null);
  const record = parseCaptureEvent(
    event('a', { merchant: 'Card 1234 5678 9012 3456', reference: '1234567890123456' }),
  )!;
  assert(!JSON.stringify(record).includes('1234 5678'));
  assert.equal(record.reference, undefined);
});

test('exact source replays survive save/relaunch and cannot double book', () => {
  let state = staged(event('a'));
  assert.equal(receiveCaptures(state, [event('a')]), state);
  state = addCapturedExpense(state, 'a', edit);
  assert.equal(state.entries.length, 1);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(receiveCaptures(state, [event('a')]).captures!.length, 1);
  assert.throws(() => addCapturedExpense(state, 'a', edit));
  // Ledger evidence also suppresses replay if reviewed inbox rows are later removed.
  assert.equal(receiveCaptures({ ...state, captures: [] }, [event('a')]).captures!.length, 0);
});

test('wallet and bank alerts become possible matches, not silently deleted transactions', () => {
  const state = staged(
    event('bank'),
    event('wallet', {
      provider: 'Google Wallet',
      cardLast4: '9876',
      receivedAt: '2026-11-22T12:02:00+08:00',
    }),
  );
  const candidates = captureCandidates(state, state.captures![0]);
  assert.equal(candidates[0].id, 'wallet');
  assert.equal(state.captures!.length, 2);
  assert.equal(state.entries.length, 0);
  const combined = combineCaptures(state, 'wallet', 'bank');
  const saved = addCapturedExpense(combined, 'bank', edit);
  assert.equal(saved.entries.length, 1);
  assert.deepEqual(saved.entries[0].capture!.sourceIds.sort(), ['bank', 'wallet']);
  assert.equal(receiveCaptures(saved, [event('wallet')]).captures!.length, 1);
});

test('same-price repeated purchases can be confirmed as separate and do not merge automatically', () => {
  let state = staged(event('a'), event('b', { receivedAt: '2026-11-22T12:03:00+08:00' }));
  state = addCapturedExpense(state, 'a', edit);
  assert.equal(
    captureCandidates(
      state,
      state.captures!.find((r) => r.id === 'b')!,
    )[0].type,
    'entry',
  );
  state = addCapturedExpense(state, 'b', edit);
  assert.equal(state.entries.length, 2);
});

test('linking preserves newer user edits, financial fields and manual categories', () => {
  const state = {
    ...staged(event('a')),
    entries: [
      {
        id: 'manual',
        kind: 'expense' as const,
        title: 'My edited name',
        amount: 1300,
        category: 'Shopping',
        date: '2026-11-22',
      },
    ],
  };
  const linked = resolveCapture(state, 'a', 'manual');
  assert.deepEqual(
    { ...linked.entries[0], capture: undefined },
    { ...state.entries[0], capture: undefined },
  );
  assert.equal(linked.entries[0].capture!.sourceIds[0], 'a');
  assert.equal(resolveCapture(staged(event('a')), 'a').captures![0].status, 'ignored');
  assert.throws(() => resolveCapture(state, 'a', 'missing'));
});

test('provider references still suggest a match after merchant edits or missing financial fields', () => {
  const source = event('original', { reference: 'TXN-abc123' });
  let state = addCapturedExpense(staged(source), 'original', { ...edit, merchant: 'My cafe name' });
  const revised = event('revised', {
    reference: 'TXN-abc123',
    text: '',
    merchant: 'Different bank description',
  });
  state = receiveCaptures(state, [revised]);
  const record = state.captures!.find((r) => r.id === 'revised')!;
  assert.equal(record.amount, '');
  assert.equal(captureCandidates(state, record)[0].id, state.entries[0].id);
  assert.match(captureCandidates(state, record)[0].reason, /Same reference/);
  assert.deepEqual(captureCandidates(state, { ...record, providers: ['Unrelated provider'] }), []);
  const pending = staged(source, revised);
  assert.equal(captureCandidates(pending, pending.captures![1])[0].id, 'original');
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].title, 'My cafe name');
});

test('combining a refund and a purchase cannot bypass refund review', () => {
  const state = staged(
    event('purchase'),
    event('refund', { text: 'Refund SGD 12.50 at Corner Cafe' }),
  );
  assert.throws(() => combineCaptures(state, 'refund', 'purchase'), /separately/);
  assert.throws(() => combineCaptures(state, 'purchase', 'refund'), /separately/);
  assert.equal(state.entries.length, 0);
  assert.equal(state.captures?.length, 2);
});

test('Shortcut replay fingerprints normalize equivalent currency, amount and time-zone representations', () => {
  const input = { merchant: 'Corner Cafe', amount: '12.50', currency: 'SGD', timestamp: time };
  assert.equal(
    shortcutCanonical(input),
    shortcutCanonical({
      ...input,
      amount: '12.5',
      currency: 'sgd',
      timestamp: '2026-11-22T04:00:00Z',
    }),
  );
  assert.notEqual(
    shortcutCanonical(input),
    shortcutCanonical({ ...input, timestamp: '2026-11-22T04:01:00Z' }),
  );
});

test('FX/tip/settlement amount changes are review suggestions only; unrelated dates do not match', () => {
  let state = addCapturedExpense(staged(event('a')), 'a', edit);
  state = receiveCaptures(state, [
    event('b', { amount: '14.00', receivedAt: '2026-11-22T12:02:00+08:00' }),
  ]);
  assert.match(
    captureCandidates(
      state,
      state.captures!.find((r) => r.id === 'b')!,
    )[0].reason,
    /differs/,
  );
  assert.equal(state.entries[0].amount, 1250);
  const nextDay = parseCaptureEvent(event('later', { receivedAt: '2026-11-25T12:00:00+08:00' }))!;
  assert.deepEqual(captureCandidates(state, nextDay), []);
});

test('financial input is validated, categories are never guessed and refunds cannot become expenses', () => {
  const state = staged(event('a'));
  for (const fields of [
    { ...edit, category: '' },
    { ...edit, amount: '12.345' },
    { ...edit, currency: '$' },
    { ...edit, date: '2026-02-30' },
  ])
    assert.throws(() => addCapturedExpense(state, 'a', fields));
  assert.throws(() =>
    addCapturedExpense(staged(event('a', { text: 'Refund SGD 12.50 at Corner Cafe' })), 'a', edit),
  );
  assert.throws(() => addCapturedExpense(state, 'a', { ...edit, currency: 'USD' }));
  const fxState: State = {
    ...state,
    fx: {
      base: 'SGD',
      rates: { SGD: 1, USD: 0.75 },
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      source: 'Test',
    },
  };
  const saved = addCapturedExpense(fxState, 'a', { ...edit, amount: '7.50', currency: 'USD' });
  assert.equal(saved.entries[0].amount, 1000);
  assert.equal(saved.entries[0].original!.amount, 750);
});

test('iPhone Shortcuts validate timestamps, arrays, currency and card suffixes before staging', () => {
  const input = { merchant: 'Corner Cafe', amount: '12.50', currency: 'SGD', timestamp: time };
  const digest = 'a'.repeat(64);
  const record = shortcutCapture(input, digest, new Date('2026-11-23T00:00:00Z'));
  assert.equal(record.id, `shortcut:${digest}`);
  assert.equal(staged(record).entries.length, 0);
  assert.equal(shortcutCanonical(input), shortcutCanonical({ ...input, unrelated: 'ignored' }));
  for (const invalid of [
    { ...input, amount: ['12.50'] },
    { ...input, currency: '$' },
    { ...input, timestamp: '2026-02-30T12:00:00Z' },
    { ...input, timestamp: '2026-11-22' },
    { ...input, timestamp: '2099-01-01T00:00:00Z' },
    { ...input, card: '1234567890123456' },
  ])
    assert.throws(() => shortcutCapture(invalid, digest, new Date('2026-11-23T00:00:00Z')));
});

test('a later receipt is held for linking and every linked image is deduplicated', () => {
  const job: ReceiptJob = {
    id: 'r',
    status: 'ready',
    fingerprint: 'photo-1',
    uri: 'file:///receipt.jpg',
    name: 'Receipt.jpg',
    mime: 'image/jpeg',
    needsReview: false,
    result: {
      merchant: edit.merchant,
      amount: 12.5,
      currency: 'SGD',
      category: edit.category,
      date: edit.date,
      notes: '',
    },
  };
  const state = addCapturedExpense(staged(event('a')), 'a', edit);
  const automatic = prepareReceiptImport([job], state, true);
  assert.equal(automatic.entries.length, 0);
  assert.match(automatic.errors.r, /existing purchase/);
  const linked = linkReceiptPurchase(state, job, state.entries[0].id);
  assert.equal(linked.entries.length, 1);
  assert.equal(linked.entries[0].amount, 1250);
  assert.deepEqual(prepareReceiptImport([job], linked, true).duplicates, ['r']);
  const second = linkReceiptPurchase(
    linked,
    { ...job, fingerprint: 'photo-2' },
    state.entries[0].id,
  );
  assert.deepEqual(second.entries[0].receiptFingerprints, ['photo-1', 'photo-2']);
  const fromReceipt = receiptEntry(job, initialState);
  const attached = resolveCapture(
    { ...staged(event('a')), entries: [fromReceipt] },
    'a',
    fromReceipt.id,
  );
  assert.deepEqual(undoReceiptImport(attached, [fromReceipt]).removed, []);
});
