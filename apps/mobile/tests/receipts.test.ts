import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptEntry, receiptMime, ReceiptJob, runReceiptQueue } from '../src/receipts';
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
