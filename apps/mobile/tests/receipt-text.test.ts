import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, type RecognizedReceipt } from '../src/receipt-text';
import { processReceipt } from '../src/receipt-processor';
import { clearDeviceReceipt, applyReceiptAudit } from '../src/receipt-audit';

const now = '2026-11-15';
function document(...rows: string[]): RecognizedReceipt {
  return {
    engine: 'apple-vision',
    width: 420,
    height: 500,
    lines: rows.map((text, index) => ({
      text,
      confidence: 0.99,
      bounds: { x: 0.1, y: index * 0.08, width: 0.8, height: 0.04 },
    })),
  };
}
const sample = document(
  'POCKET CAFE',
  '2026-11-08',
  'Currency: USD',
  'Coffee 5.00',
  'TOTAL USD 5.00',
  'Thank you',
);
const file = {
  id: 'receipt-1',
  uri: 'file:///receipt.heic',
  name: 'receipt.heic',
  mime: 'image/heic',
  size: 1000,
};

test('device receipt parsing extracts the printed merchant, final total, date and currency', () => {
  assert.deepEqual(parseReceiptText(sample, now), {
    merchant: 'POCKET CAFE',
    amount: 5,
    currency: 'USD',
    date: '2026-11-08',
    category: 'Other',
    notes: '',
  });
});
test('tax, subtotal, tips, cash tender and change do not replace the final total', () => {
  const parsed = parseReceiptText(
    document(
      'Market',
      '2026-11-08',
      'SUBTOTAL S$ 10.00',
      'GST 9% 0.90',
      'TOTAL S$ 10.90',
      'Cash 50.00',
      'Change 39.10',
      'Suggested tip 2.00',
    ),
    now,
  );
  assert.equal(parsed.amount, 10.9);
  assert.equal(parsed.currency, 'SGD');
});
test('generic dollar signs and ambiguous numeric dates remain blank for review', () => {
  const parsed = parseReceiptText(document('Cafe', '08/11/2026', 'TOTAL $5.00'), now);
  assert.equal(parsed.currency, '');
  assert.equal(parsed.date, '');
  assert.match(parsed.notes, /currency/);
  assert.match(parsed.notes, /date/);
});
test('conflicting totals are left blank, while a grand total outranks a plain total', () => {
  assert.equal(
    parseReceiptText(document('Cafe', 'TOTAL USD 5.00', 'TOTAL USD 8.00'), now).amount,
    0,
  );
  assert.equal(
    parseReceiptText(document('Cafe', 'TOTAL USD 5.00', 'GRAND TOTAL USD 8.00'), now).amount,
    8,
  );
});
test('refunds, zero totals and unlabeled product prices are not positive expenses', () => {
  for (const rows of [
    ['TOTAL USD -5.00', '10.00'],
    ['TOTAL USD 0.00', '5.00'],
    ['Coffee USD 5.00', 'Tax 0.50'],
    ['TOTAL USD -5.00 10.00'],
  ])
    assert.equal(parseReceiptText(document(...rows), now).amount, 0);
});
test('US and European separators and zero-decimal currencies are supported', () => {
  for (const [line, amount, currency] of [
    ['TOTAL USD 1,234.56', 1234.56, 'USD'],
    ['TOTAL TTC EUR 1.234,56', 1234.56, 'EUR'],
    ['TOTAL EUR 12,50', 12.5, 'EUR'],
    ['TOTAL SGD12.50', 12.5, 'SGD'],
    ['TOTAL JPY 1,250', 1250, 'JPY'],
    ['TOTAL JPY 12.50', 0, 'JPY'],
  ] as const) {
    const parsed = parseReceiptText(document('Market', line), now);
    assert.equal(parsed.amount, amount, line);
    assert.equal(parsed.currency, currency, line);
  }
});
test('an amount on a separate row and a Chinese total label are supported', () => {
  const parsed = parseReceiptText(document('Cafe', '2026-11-08', '合计', 'SGD 12.50'), now);
  assert.equal(parsed.amount, 12.5);
  assert.equal(parsed.currency, 'SGD');
});
test('split label and amount boxes are joined in reading order', () => {
  const source = document('Cafe', '2026-11-08', 'TOTAL', 'USD 12.50');
  source.lines[2].bounds = { x: 0.1, y: 0.4, width: 0.3, height: 0.03 };
  source.lines[3].bounds = { x: 0.7, y: 0.402, width: 0.2, height: 0.03 };
  source.lines.reverse();
  assert.equal(parseReceiptText(source, now).amount, 12.5);
});
test('invalid, future and conflicting dates are not replaced with today', () => {
  for (const date of ['2026-02-30', '2028-01-01', '08/11/26'])
    assert.equal(parseReceiptText(document('Cafe', date), now).date, '');
  assert.equal(parseReceiptText(document('Cafe', '2026-11-08', '2026-11-09'), now).date, '');
  for (const date of ['8 Nov 2026', 'November 8, 2026', '11/08/2026', '23/10/2026']) {
    const actual = parseReceiptText(document('Cafe', date), now).date;
    assert.equal(
      actual,
      date === '11/08/2026' ? '' : date === '23/10/2026' ? '2026-10-23' : '2026-11-08',
    );
  }
});
test('low-confidence OCR cannot populate totals and multiple currencies require review', () => {
  const source = document('Cafe', 'TOTAL USD 15.00');
  source.lines[1].confidence = 0.2;
  assert.equal(parseReceiptText(source, now).amount, 0);
  assert.equal(parseReceiptText(document('Cafe', 'TOTAL USD 5.00 SGD 6.70'), now).currency, '');
});

test('OCR runs first and its text then goes to the separate on-device classifier', async () => {
  const calls: string[] = [];
  const output = await processReceipt(file, {
    recognize: async (uri) => {
      assert.equal(uri, file.uri);
      calls.push('ocr');
      return sample;
    },
    classify: async (document, draft) => {
      calls.push('ai');
      assert.equal(document, sample);
      assert.equal(draft.amount, 5);
      return { status: 'classified', category: 'Food & drinks', approved: true };
    },
  });
  assert.deepEqual(calls, ['ocr', 'ai']);
  assert.equal(output.result.category, 'Food & drinks');
  assert.equal(output.result.amount, 5);
  assert.equal(output.needsReview, false);
});
test('OCR and validation never substitute for unavailable on-device AI classification', async () => {
  const output = await processReceipt(file, {
    recognize: async () => sample,
    classify: async () => ({ status: 'unavailable', reason: 'Model disabled' }),
  });
  assert.equal(output.result.amount, 5);
  assert.equal(output.result.currency, 'USD');
  assert.equal(output.result.category, '');
  assert.equal(output.needsReview, true);
  const failed = await processReceipt(file, {
    recognize: async () => sample,
    classify: async () => {
      throw new Error('Model failed');
    },
  });
  assert.equal(failed.result.category, '');
  assert.equal(failed.needsReview, true);
});
test('missing native OCR, PDFs and oversized files stop without a network fallback', async () => {
  let classifyCalls = 0;
  const operations = {
    recognize: async () => {
      throw new Error('Native OCR unavailable');
    },
    classify: async () => {
      classifyCalls++;
      return { status: 'unavailable' as const, reason: 'Unavailable' };
    },
  };
  await assert.rejects(processReceipt(file, operations), /Native OCR unavailable/);
  await assert.rejects(
    processReceipt({ ...file, mime: 'application/pdf' }, operations),
    /receipt photo/,
  );
  await assert.rejects(processReceipt({ ...file, size: 9 * 1024 * 1024 }, operations), /8 MB/);
  assert.equal(classifyCalls, 0);
});
test('automatic device import requires high-confidence financial evidence plus AI classification', async () => {
  const draft = parseReceiptText(sample, now);
  assert.equal(clearDeviceReceipt(sample, draft), true);
  const blurry = structuredClone(sample);
  blurry.lines[4].confidence = 0.7;
  assert.equal(parseReceiptText(blurry, now).amount, 5);
  assert.equal(clearDeviceReceipt(blurry, draft), false);
  const footer = structuredClone(sample);
  footer.lines[5].confidence = 0.1;
  assert.equal(clearDeviceReceipt(footer, draft), true);
  const output = await processReceipt(file, {
    recognize: async () => blurry,
    classify: async () => ({ status: 'classified', category: 'Food & drinks', approved: true }),
  });
  assert.equal(output.needsReview, true);
});
test('classification cannot rewrite money, dates or currencies, or approve missing evidence', async () => {
  const draft = parseReceiptText(sample, now);
  const classification = {
    status: 'classified' as const,
    approved: true,
    category: 'Food & drinks' as const,
    amount: 999,
    currency: 'XYZ',
    date: '2099-01-01',
  };
  assert.deepEqual(applyReceiptAudit(draft, classification), {
    ...draft,
    category: 'Food & drinks',
  });
  const operations = { recognize: async () => sample, classify: async () => classification };
  const rejected = await processReceipt(file, {
    ...operations,
    classify: async () => ({ ...classification, approved: false }),
  });
  assert.equal(rejected.needsReview, true);
  const missing = await processReceipt(file, {
    ...operations,
    recognize: async () => document('Cafe', 'TOTAL $5.00'),
  });
  assert.equal(missing.needsReview, true);
  assert.equal(missing.result.currency, '');
});
