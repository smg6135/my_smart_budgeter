import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureAcknowledgements } from '../src/capture-acknowledgements';
import { receiveCaptures, type CaptureEvent } from '../src/transaction-capture';
import { initialState } from '../src/finance';

const event = (id: string): CaptureEvent => ({
  id,
  provider: 'Test bank',
  receivedAt: '2026-11-22T12:00:00Z',
  amount: '12.50',
  currency: 'SGD',
  merchant: 'Cafe',
});
test('native events are not acknowledged before a persisted snapshot; later arrivals remain queued', async () => {
  let pending = [event('a')];
  const acked: string[] = [];
  const tracker = new CaptureAcknowledgements({
    pending: async () => pending,
    acknowledge: async (_, ids) => {
      acked.push(...ids);
      pending = pending.filter((e) => !ids.includes(e.id));
    },
  });
  await tracker.retry('budget-a');
  assert.deepEqual(acked, []);
  const snapshot = receiveCaptures(initialState, pending);
  pending.push(event('b'));
  await tracker.persisted('budget-a', snapshot);
  assert.deepEqual(acked, ['a']);
  assert.deepEqual(
    pending.map((e) => e.id),
    ['b'],
  );
  // OS replays after queue acknowledgement must not fill the encrypted queue forever.
  pending.push(event('a'));
  await tracker.retry('budget-a');
  assert.deepEqual(acked, ['a', 'a']);
  assert.deepEqual(
    pending.map((e) => e.id),
    ['b'],
  );
});
test('failed native acknowledgement is retryable and snapshots cannot authorize another budget', async () => {
  let fail = true;
  const acked: string[] = [];
  const tracker = new CaptureAcknowledgements({
    pending: async () => [event('a')],
    acknowledge: async (_, ids) => {
      if (fail) throw Error('native write failed');
      acked.push(...ids);
    },
  });
  await assert.rejects(tracker.persisted('budget-a', receiveCaptures(initialState, [event('a')])));
  fail = false;
  await tracker.retry('budget-b');
  assert.deepEqual(acked, []);
  await tracker.retry('budget-a');
  assert.deepEqual(acked, ['a']);
  tracker.forget('budget-a');
  await tracker.retry('budget-a');
  assert.deepEqual(acked, ['a']);
});
