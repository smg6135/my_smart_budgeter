import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertMinor,
  displayAmount,
  formatMoney,
  freshQuote,
  parseAmount,
  rateFor,
  FxSnapshot,
} from '../src/currency';
const quote: FxSnapshot = {
  base: 'SGD',
  rates: { SGD: 1, USD: 0.75, JPY: 110, CAD: 1.05 },
  fetchedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  source: 'Coinbase',
};
test('converts in the correct direction and rounds once to budget units', () => {
  assert.equal(convertMinor(10000, 'USD', 'SGD', 1 / 0.75), 13333);
  assert.equal(convertMinor(13333, 'SGD', 'USD', 0.75), 10000);
});
test('zero-decimal currencies have exact input, formatting and conversion', () => {
  assert.equal(parseAmount('1000', 'JPY'), 1000);
  assert.throws(() => parseAmount('1000.50', 'JPY'));
  assert.equal(convertMinor(1000, 'JPY', 'SGD', 1 / 110), 909);
  assert.equal(convertMinor(10000, 'SGD', 'JPY', 110), 11000);
  assert(!formatMoney(1000, 'JPY').includes('.'));
});
test('missing or mismatched quotes never relabel a budget amount', () => {
  assert.equal(rateFor(quote, 'USD', 'CAD'), undefined);
  assert.equal(rateFor(undefined, 'SGD', 'SGD'), 1);
  assert.match(displayAmount(10000, 'SGD', 'USD'), /SGD/);
  assert.equal(displayAmount(10000, 'SGD', 'USD', quote), formatMoney(7500, 'USD'));
});
test('rejects malformed and unsafe conversions', () => {
  for (const rate of [0, -1, NaN, Infinity])
    assert.throws(() => convertMinor(100, 'USD', 'SGD', rate));
  assert.throws(() => convertMinor(Number.MAX_SAFE_INTEGER, 'USD', 'SGD', 100));
  assert.equal(rateFor({ ...quote, rates: { USD: NaN } }, 'SGD', 'USD'), undefined);
});
test('saved rates expire and preserve their original fetch time', () => {
  assert(freshQuote(quote));
  assert(!freshQuote({ ...quote, expiresAt: '2000-01-01T00:00:00Z' }));
  assert(!freshQuote(undefined));
});

test('report conversions support large nominal currencies without arbitrary amount caps', () => {
  assert.equal(convertMinor(12345678900, 'SGD', 'VND', 19000), 2345678991000);
});
