import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRates } from '../src/api';

test('FX fetch uses the public feed without an account, token, AI key or budget payload', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://api.coinbase.com/v2/exchange-rates?currency=SGD');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    return new Response(
      JSON.stringify({
        data: { currency: 'SGD', rates: { SGD: '1', USD: '0.75', EUR: '-1', UNKNOWN: '10' } },
      }),
    );
  });
  const quote = await getRates('SGD');
  assert.deepEqual(quote.rates, { SGD: 1, USD: 0.75 });
  assert.equal(quote.source, 'Coinbase');
  assert.equal(Date.parse(quote.expiresAt) - Date.parse(quote.fetchedAt), 300000);
});

test('mismatched bases, missing/invalid base rates and bad responses never become usable quotes', async (context) => {
  for (const data of [
    { currency: 'USD', rates: { SGD: 1 } },
    { currency: 'SGD', rates: {} },
    { currency: 'SGD', rates: { SGD: 'NaN' } },
    { currency: 'SGD', rates: { SGD: 0.5 } },
  ]) {
    context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data })));
    await assert.rejects(getRates('SGD'), /invalid/);
    context.mock.restoreAll();
  }
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(getRates('SGD'), /manually/);
  await assert.rejects(getRates('XYZ'), /Unsupported/);
});
