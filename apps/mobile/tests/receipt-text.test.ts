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
test('device processing never reads/uploads an image or calls the cloud parser', async () => {
  let cloudCalls = 0;
  const output = await processReceipt(file, 'device', {
    recognize: async (uri) => {
      assert.equal(uri, file.uri);
      return sample;
    },
    cloud: async () => {
      cloudCalls++;
      throw new Error('Must not upload');
    },
  });
  assert.equal(output.engine, 'device');
  assert.equal(output.result.amount, 5);
  assert.match(output.recognizedText!, /TOTAL USD 5.00/);
  assert.equal(cloudCalls, 0);
});
test('missing native modules, unreadable images and PDFs never silently fall back to cloud', async () => {
  let cloudCalls = 0;
  const operations = {
    recognize: async () => {
      throw new Error('Native OCR unavailable');
    },
    cloud: async () => {
      cloudCalls++;
      throw new Error('Must not upload');
    },
  };
  await assert.rejects(processReceipt(file, 'device', operations), /Native OCR unavailable/);
  await assert.rejects(
    processReceipt({ ...file, mime: 'application/pdf' }, 'device', operations),
    /PDF needs cloud OCR/,
  );
  await assert.rejects(
    processReceipt({ ...file, size: 9 * 1024 * 1024 }, 'device', operations),
    /8 MB/,
  );
  assert.equal(cloudCalls, 0);
});
test('explicit cloud processing uses the cloud path without starting native OCR', async () => {
  const expected = parseReceiptText(sample, now);
  const output = await processReceipt(file, 'cloud', {
    recognize: async () => {
      throw new Error('Must not run native OCR');
    },
    cloud: async (input) => {
      assert.equal(input, file);
      return expected;
    },
  });
  assert.equal(output.engine, 'cloud');
  assert.equal(output.result, expected);
  assert.equal(output.recognizedText, undefined);
});

test('automatic device import requires high-confidence financial evidence', () => {
  const draft = parseReceiptText(sample, now);
  assert.equal(clearDeviceReceipt(sample, draft), true);
  const blurry = structuredClone(sample);
  blurry.lines[4].confidence = 0.7;
  // The draft still parses, but must not auto-add without strong total evidence.
  assert.equal(parseReceiptText(blurry, now).amount, 5);
  assert.equal(clearDeviceReceipt(blurry, draft), false);
  const footer = structuredClone(sample);
  footer.lines[5].confidence = 0.1;
  assert.equal(clearDeviceReceipt(footer, draft), true);
});

test('local model can classify or veto, but cannot rewrite financial fields', async () => {
  const draft = parseReceiptText(sample, now);
  const audit = {
    status: 'reviewed' as const,
    approved: true,
    category: 'Food & drinks',
    amount: 999,
    currency: 'XYZ',
    date: '2099-01-01',
  };
  assert.deepEqual(applyReceiptAudit(draft, audit), { ...draft, category: 'Food & drinks' });
  assert.equal(applyReceiptAudit(draft, { ...audit, category: 'Unknown' }).category, 'Other');
  let cloudCalls = 0;
  const operations = {
    recognize: async () => sample,
    cloud: async () => {
      cloudCalls++;
      return draft;
    },
  };
  const approved = await processReceipt(file, 'device', {
    ...operations,
    review: async () => audit,
  });
  assert.equal(approved.needsReview, false);
  const veto = await processReceipt(file, 'device', {
    ...operations,
    review: async () => ({ ...audit, approved: false, reason: 'Check total' }),
  });
  assert.equal(veto.needsReview, true);
  const unavailable = await processReceipt(file, 'device', {
    ...operations,
    review: async () => {
      throw new Error('Model disabled');
    },
  });
  assert.equal(unavailable.needsReview, false);
  assert.deepEqual(unavailable.audit, { status: 'unavailable' });
  const missing = await processReceipt(file, 'device', {
    ...operations,
    recognize: async () => document('Cafe', 'TOTAL $5.00'),
    review: async () => audit,
  });
  assert.equal(missing.needsReview, true);
  assert.equal(missing.result.currency, '');
  assert.equal(cloudCalls, 0);
});
