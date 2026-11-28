import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runReceiptAi,
  readReceiptExtraction,
  receiptExtractionMessages,
} from '../src/receipt-extraction';
import { parseReceiptText, type RecognizedReceipt } from '../src/receipt-text';
import { processReceipt } from '../src/receipt-processor';
import { receiptEntry, prepareReceiptImport, undoReceiptImport } from '../src/receipts';
import { initialState } from '../src/finance';
import { captureCandidates, parseCaptureEvent } from '../src/transaction-capture';

const document: RecognizedReceipt = {
  engine: 'apple-vision',
  width: 420,
  height: 500,
  lines: [
    'POCKET CAFE',
    '2026-11-08',
    'Currency: USD',
    'Coffee 5.00',
    'TOTAL USD 5.00',
    'Thank you',
  ].map((text, i) => ({
    text,
    confidence: 0.99,
    bounds: { x: 0.1, y: i * 0.08, width: 0.8, height: 0.04 },
  })),
};
const extraction = {
  title: 'Morning coffee',
  detail: 'A cappuccino',
  merchant: 'POCKET CAFE',
  total: '5.00',
  currency: 'USD',
  date: '2026-11-08',
};
const draft = parseReceiptText(document);
const file = { id: 'extracted', uri: 'file:///r.jpg', name: 'r.jpg', mime: 'image/jpeg' };

test('OCR extraction precedes a fresh category request that sees only title and detail', async () => {
  const calls: string[] = [];
  let release!: (value: string) => void;
  const first = new Promise<string>((resolve) => {
    release = resolve;
  });
  const pending = runReceiptAi(document, draft, ['Food & drinks', 'Other'], async (messages) => {
    calls.push(messages[0].content);
    if (calls.length === 1) {
      assert(messages[1].content.includes('TOTAL USD 5.00'));
      return first;
    }
    const data = JSON.parse(messages[1].content);
    assert.deepEqual(JSON.parse(data.expenseText), {
      title: extraction.title,
      detail: extraction.detail,
    });
    assert(!messages.some((message) => message.content.includes('TOTAL USD 5.00')));
    assert.equal(data.categories.c0, 'Food & drinks');
    return '{"category":"c0"}';
  });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  release(JSON.stringify(extraction));
  const result = await pending;
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'classified');
  assert.equal(result.approved, true);
  assert.deepEqual(result.extraction, extraction);
});

test('the complete pipeline saves the extracted title/detail and preserves printed merchant for duplicate matching', async () => {
  let count = 0;
  const result = await processReceipt(file, {
    recognize: async () => document,
    classify: (doc, parsed) =>
      runReceiptAi(doc, parsed, ['Food & drinks'], async () =>
        ++count === 1 ? JSON.stringify(extraction) : '{"category":"c0"}',
      ),
  });
  assert.equal(result.needsReview, false);
  assert.equal(count, 2);
  const state = { ...initialState, currency: 'USD' };
  const entry = receiptEntry({ ...file, ...result, status: 'ready' }, state);
  assert.equal(entry.title, 'Morning coffee');
  assert.equal(entry.detail, 'A cappuccino');
  assert.equal(entry.amount, 500);
  assert.equal(entry.receiptMerchant, 'POCKET CAFE');
  const record = parseCaptureEvent({
    id: 'bank',
    provider: 'Bank',
    receivedAt: '2026-11-08T12:00:00Z',
    merchant: 'POCKET CAFE',
    amount: '5.00',
    currency: 'USD',
  })!;
  assert.equal(captureCandidates({ ...state, entries: [entry] }, record).length, 1);
  assert.deepEqual(
    undoReceiptImport({ ...state, entries: [{ ...entry, detail: 'Edited by user' }] }, [entry])
      .removed,
    [],
  );
});

test('disagreement with printed totals becomes a visible proposal for review and cannot auto-add', async () => {
  let count = 0;
  const result = await processReceipt(file, {
    recognize: async () => document,
    classify: (doc, parsed) =>
      runReceiptAi(doc, parsed, ['Other'], async () =>
        ++count === 1 ? JSON.stringify({ ...extraction, total: '50.00' }) : '{"category":"c0"}',
      ),
  });
  assert.equal(result.result.amount, 50);
  assert.equal(result.needsReview, true);
  assert.equal(result.audit.approved, false);
  const automatic = prepareReceiptImport(
    [{ ...file, ...result, status: 'ready' }],
    { ...initialState, currency: 'USD' },
    true,
  );
  assert.equal(automatic.entries.length, 0);
});

test('invalid extraction never reaches category inference; unknown outputs remain review-only', async () => {
  for (const invalid of [
    'bad',
    'null',
    JSON.stringify({ ...extraction, total: '5.001' }),
    JSON.stringify({ ...extraction, title: 'x'.repeat(121) }),
    JSON.stringify({ ...extraction, currency: '$' }),
  ]) {
    let calls = 0;
    await assert.rejects(
      runReceiptAi(document, draft, ['Other'], async () => {
        calls++;
        return invalid;
      }),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  const result = await runReceiptAi(document, draft, ['Other'], async () =>
    ++calls === 1 ? JSON.stringify(extraction) : '{"category":"invented"}',
  );
  assert.equal(result.status, 'needs-input');
  assert.equal(result.approved, false);
  assert.deepEqual(result.extraction, extraction);
});

test('the processor independently rejects automatic import even if an adapter incorrectly approves a changed total', async () => {
  const output = await processReceipt(file, {
    recognize: async () => document,
    classify: async () => ({
      status: 'classified',
      category: 'Other',
      approved: true,
      extraction: { ...extraction, total: '50.00' },
    }),
  });
  assert.equal(output.needsReview, true);
  assert.equal(
    prepareReceiptImport(
      [{ ...file, ...output, status: 'ready' }],
      { ...initialState, currency: 'USD' },
      true,
    ).entries.length,
    0,
  );
});

test('category inference failure retains extraction, while cancellation stops before the second call', async () => {
  let calls = 0;
  const result = await runReceiptAi(document, draft, ['Other'], async () => {
    if (++calls === 1) return JSON.stringify(extraction);
    throw Error('model unavailable');
  });
  assert.deepEqual(result.extraction, extraction);
  assert.equal(result.approved, false);
  calls = 0;
  let interrupted = false;
  await assert.rejects(
    runReceiptAi(
      document,
      draft,
      ['Other'],
      async () => {
        calls++;
        interrupted = true;
        return JSON.stringify(extraction);
      },
      () => {
        if (interrupted) throw Error('cancelled');
      },
    ),
    /cancelled/,
  );
  assert.equal(calls, 1);
});

test('long OCR keeps both the header and final totals; missing values never mix currencies', async () => {
  const long = {
    ...document,
    lines: [document.lines[0], { ...document.lines[1], text: 'x'.repeat(5000) }, document.lines[4]],
  };
  const prompt = receiptExtractionMessages(long)[1].content;
  assert(prompt.includes('POCKET CAFE'));
  assert(prompt.includes('TOTAL USD 5.00'));
  assert(prompt.length < 3200);
  assert.equal(
    readReceiptExtraction(JSON.stringify({ ...extraction, total: '', currency: '' })).total,
    '',
  );
  let count = 0;
  const result = await processReceipt(file, {
    recognize: async () => document,
    classify: (doc, parsed) =>
      runReceiptAi(doc, parsed, ['Other'], async () =>
        ++count === 1
          ? JSON.stringify({ ...extraction, total: '', currency: 'SGD' })
          : '{"category":"c0"}',
      ),
  });
  assert.equal(result.result.amount, 5);
  assert.equal(result.result.currency, 'USD');
  assert.equal(result.needsReview, true);
});
