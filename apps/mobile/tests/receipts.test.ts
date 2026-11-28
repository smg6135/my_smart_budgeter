import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  receiptEntry,
  receiptMime,
  receiptDraft,
  prepareReceiptImport,
  undoReceiptImport,
  ReceiptJob,
  runReceiptQueue,
} from '../src/receipts';
import { initialState, today } from '../src/finance';
const job: ReceiptJob = {
  id: 'r',
  uri: 'local',
  name: 'bill.pdf',
  mime: 'application/pdf',
  status: 'ready',
  result: {
    merchant: 'Cafe',
    amount: 12.5,
    currency: 'SGD',
    date: today(),
    category: 'Food & drinks',
    notes: '',
  },
};
test('receipt uploads recognize HEIC and HEIF with missing or generic MIME types', () => {
  assert.equal(receiptMime('IMG_1234.HEIC'), 'image/heic');
  assert.equal(receiptMime('receipt.heif', 'application/octet-stream'), 'image/heif');
  assert.equal(receiptMime('image', 'IMAGE/HEIC'), 'image/heic');
  assert.equal(receiptMime('photo.jpg', 'image/jpg'), 'image/jpeg');
  assert.equal(receiptMime('receipt.heic', 'image/jpeg'), 'image/jpeg');
  assert.equal(receiptMime('receipt.txt', 'text/plain'), '');
});
test('receipt entries have stable IDs and use the printed amount', () => {
  const e = receiptEntry(job, initialState);
  assert.equal(e.id, 'receipt-r');
  assert.equal(e.amount, 1250);
  assert.equal(e.kind, 'expense');
  assert.equal(receiptEntry(job, initialState).id, e.id);
});
test('foreign receipts preserve original amount and conversion', () => {
  const e = receiptEntry(
    { ...job, result: { ...job.result!, amount: 75, currency: 'USD' } },
    {
      ...initialState,
      fx: {
        base: 'SGD',
        rates: { SGD: 1, USD: 0.75 },
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        source: 'Coinbase',
      },
    },
  );
  assert.equal(e.amount, 10000);
  assert.equal(e.original?.amount, 7500);
  assert.equal(e.original?.rate, 1 / 0.75);
});
test('bad receipt dates, amounts and missing FX require review', () => {
  for (const changes of [
    { date: '2099-01-01' },
    { amount: 0 },
    { date: '2026-02-30' },
    { currency: 'USD' },
    { currency: 'XYZ' },
    { merchant: '' },
  ])
    assert.throws(() =>
      receiptEntry({ ...job, result: { ...job.result!, ...changes } }, initialState),
    );
});
test('batch queue limits concurrency and processes every item', async () => {
  let active = 0,
    max = 0;
  const processed: number[] = [];
  await runReceiptQueue([1, 2, 3, 4, 5], async (n) => {
    active++;
    max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    processed.push(n);
    active--;
  });
  assert.equal(max, 2);
  assert.deepEqual(processed.sort(), [1, 2, 3, 4, 5]);
});

test('automatic import skips uncertainty and invalid fields, and deduplicates exact images', () => {
  const clear = { ...job, fingerprint: 'photo-a', needsReview: false };
  const uncertain = { ...job, id: 'uncertain', needsReview: true };
  const invalid = { ...job, id: 'invalid', result: { ...job.result!, date: '2099-01-01' } };
  const duplicate = { ...clear, id: 'duplicate' };
  const samePurchase = { ...clear, id: 'separate-photo', fingerprint: 'photo-b' };
  const batch = prepareReceiptImport(
    [clear, uncertain, invalid, duplicate, samePurchase],
    initialState,
    true,
  );
  assert.deepEqual(batch.saved, ['r']);
  assert.match(batch.errors['separate-photo'], /Possible existing purchase/);
  // A different image with the same purchase fields is held, not silently discarded.
  // A user can explicitly confirm it is a separate purchase.
  assert.equal(
    prepareReceiptImport([samePurchase], { ...initialState, entries: batch.entries }).entries
      .length,
    1,
  );
  assert.deepEqual(batch.duplicates, ['duplicate']);
  assert.match(batch.errors.invalid, /date/);
  assert.equal(batch.errors.uncertain, undefined);
  const again = prepareReceiptImport(
    [clear, duplicate],
    { ...initialState, entries: batch.entries },
    true,
  );
  assert.equal(again.entries.length, 0);
  assert.equal(prepareReceiptImport([uncertain], initialState).entries.length, 1);
});

test('receipt corrections preserve exact money and accept a validated manual FX rate', () => {
  const draft = {
    ...receiptDraft(job.result),
    amount: '5.01',
    currency: 'USD',
    exchangeRate: '1.35',
  };
  const entry = receiptEntry({ ...job, draft }, initialState);
  assert.equal(entry.amount, 676);
  assert.equal(entry.original?.amount, 501);
  assert.equal(entry.original?.source, 'Manual');
  for (const exchangeRate of ['0', '-1', 'NaN', 'Infinity'])
    assert.throws(() => receiptEntry({ ...job, draft: { ...draft, exchangeRate } }, initialState));
  assert.throws(() => receiptEntry({ ...job, draft: { ...draft, amount: '5.001' } }, initialState));
});

test('Undo removes only its unchanged imports and preserves other or edited expenses', () => {
  const imported = receiptEntry({ ...job, fingerprint: 'photo-a' }, initialState);
  const second = { ...imported, id: 'receipt-second' };
  const unrelated = { ...imported, id: 'manual' };
  const edited = { ...second, title: 'Edited merchant' };
  const state = { ...initialState, entries: [imported, edited, unrelated] };
  const undone = undoReceiptImport(state, [imported, second]);
  assert.deepEqual(undone.removed, [imported.id]);
  assert.deepEqual(undone.state.entries, [edited, unrelated]);
  assert.deepEqual(undoReceiptImport(undone.state, [imported]).removed, []);
});
