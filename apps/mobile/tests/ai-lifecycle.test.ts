import test from 'node:test';
import assert from 'node:assert/strict';
import { AiLifecycle, stopLocalCompletion, waitForForeground } from '../src/ai-lifecycle';

test('suspension accepts the native void stop return despite its Promise declaration', async () => {
  const nativeStop = (() => undefined) as unknown as () => Promise<void>;
  assert.throws(() => nativeStop().catch(() => {}), TypeError);
  await assert.doesNotReject(stopLocalCompletion(nativeStop));
  let stopped = false;
  await stopLocalCompletion(() => {
    stopped = true;
  });
  assert.equal(stopped, true);
});

test('suspension handles synchronous stop errors and awaits asynchronous stops', async () => {
  await assert.doesNotReject(
    stopLocalCompletion(() => {
      throw new Error('missing context');
    }),
  );
  await assert.doesNotReject(stopLocalCompletion(() => Promise.reject(new Error('stop failed'))));
  let finish!: () => void;
  let completed = false;
  const stopping = stopLocalCompletion(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  ).then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await stopping;
  assert.equal(completed, true);
});

test('a lock during model loading invalidates the request even after unlocking', async () => {
  let active = true;
  const lifecycle = new AiLifecycle(() => active);
  const check = lifecycle.checkpoint();
  await Promise.resolve(); // native loading/formatting may yield
  active = false;
  lifecycle.interrupt();
  assert.throws(check);
  active = true;
  assert.throws(check);
  assert.doesNotThrow(lifecycle.checkpoint());
});

test('background work is rejected and memory pressure invalidates active work', () => {
  let active = false;
  const lifecycle = new AiLifecycle(() => active);
  assert.throws(() => lifecycle.checkpoint());
  active = true;
  const check = lifecycle.checkpoint();
  lifecycle.interrupt();
  assert.throws(check);
});

test('receipt stages wait for unlock and clean up on resume or cancellation', async () => {
  let active = false;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const controller = new AbortController();
  let completed = false;
  const waiting = waitForForeground(() => active, subscribe, controller.signal).then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  for (const changed of listeners) changed();
  assert.equal(completed, false);
  active = true;
  for (const changed of listeners) changed();
  await waiting;
  assert.equal(completed, true);
  assert.equal(listeners.size, 0);
  active = false;
  const cancelled = waitForForeground(() => active, subscribe, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(listeners.size, 0);
  active = true;
  await assert.rejects(waitForForeground(() => active, subscribe, controller.signal));
});
