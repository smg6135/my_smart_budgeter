import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalModelStore, type ModelSpec, type ModelStorage } from '../src/local-model-store';
import {
  categoryMessages,
  categorySchema,
  readCategory,
  receiptReviewMessages,
  receiptReviewMatches,
} from '../src/local-ai-prompts';
import { localModel } from '../src/local-model';

const model: ModelSpec = {
  id: 'test',
  name: 'Test',
  url: 'https://weights.example/model.gguf',
  bytes: 100,
  sha256: 'pinned',
};
function fixture() {
  const files = new Map<string, string>();
  const calls: string[] = [];
  let network: 'wifi' | 'cellular' | 'offline' = 'wifi',
    paused = false;
  const storage: ModelStorage = {
    path: '/models/test.gguf',
    prepare: async () => {
      calls.push('prepare');
    },
    exists: async (path) => files.has(path),
    verify: async (path) => {
      calls.push(`verify:${path}`);
      return files.get(path) === 'valid';
    },
    freeBytes: async () => 1000000000,
    network: async () => network,
    paused: async () => paused,
    setPaused: async (value) => {
      paused = value;
    },
    remove: async (path) => {
      files.delete(path);
    },
    move: async (from, to) => {
      calls.push('install');
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    download: async (url, path, progress) => {
      calls.push(url);
      files.set(path, 'valid');
      progress(50);
      return 200;
    },
  };
  return {
    storage,
    files,
    calls,
    store: new LocalModelStore(model, storage),
    setNetwork: (value: typeof network) => {
      network = value;
    },
  };
}
test('download once to partial file, verify before atomic install; reuse offline', async () => {
  const f = fixture();
  const progress: number[] = [];
  f.store.subscribe(() => progress.push(f.store.getSnapshot().progress));
  await Promise.all([f.store.ensure(), f.store.ensure(), f.store.ensure()]);
  assert.equal(f.calls.filter((c) => c === model.url).length, 1);
  assert(f.calls.indexOf('verify:/models/test.gguf.part') < f.calls.indexOf('install'));
  assert(progress.includes(0.5));
  assert.equal(f.files.has('/models/test.gguf.part'), false);
  f.setNetwork('offline');
  await f.store.ensure();
  assert.equal(await f.store.path(), f.storage.path);
  assert.equal(f.store.getSnapshot().status, 'ready');
});
test('installed model is integrity checked on a fresh process, even offline', async () => {
  const f = fixture();
  f.files.set(f.storage.path, 'valid');
  f.setNetwork('offline');
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'ready');
  assert.equal(f.calls.includes(model.url), false);
  assert(f.calls.includes(`verify:${f.storage.path}`));
});
test('corrupt installed model is removed and replaced', async () => {
  const f = fixture();
  f.files.set(f.storage.path, 'corrupt');
  await f.store.ensure();
  assert.equal(f.files.get(f.storage.path), 'valid');
});
test('offline first use does not attempt download; reconnect can install', async () => {
  const f = fixture();
  f.setNetwork('offline');
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'waiting');
  assert.equal(f.calls.includes(model.url), false);
  f.setNetwork('wifi');
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'ready');
});
test('mobile data requires explicit download; automatic checks do not spend data', async () => {
  const f = fixture();
  f.setNetwork('cellular');
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'waiting');
  assert.equal(f.calls.includes(model.url), false);
  await f.store.ensure(true, true);
  assert.equal(f.store.getSnapshot().status, 'ready');
});
test('HTTP failures never install and do not retry every availability poll', async () => {
  const f = fixture();
  let attempts = 0;
  f.storage.download = async () => {
    attempts++;
    return 503;
  };
  await f.store.ensure();
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'error');
  assert.equal(attempts, 1);
  await f.store.ensure(false, true);
  assert.equal(attempts, 2);
  assert.equal(f.files.has(f.storage.path), false);
});
test('same-size damaged weights are rejected; partials are removed', async () => {
  const f = fixture();
  f.storage.download = async (_url, path) => {
    f.files.set(path, 'damaged');
    return 200;
  };
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'error');
  assert.equal(f.files.size, 0);
  await assert.rejects(f.store.path(), /not installed/);
});
test('interrupted partials are restarted, never mistaken for installed weights', async () => {
  const f = fixture();
  f.files.set(`${f.storage.path}.part`, 'truncated');
  await f.store.ensure();
  assert.equal(f.files.get(f.storage.path), 'valid');
});
test('insufficient disk space stops before requesting weights', async () => {
  const f = fixture();
  f.storage.freeBytes = async () => 100;
  await f.store.ensure();
  assert.equal(f.calls.includes(model.url), false);
  assert.match(f.store.getSnapshot().reason!, /storage/);
});
test('pause cancels in-flight work; late completion cannot install, and pause survives restart', async () => {
  const f = fixture();
  let started!: () => void;
  const downloading = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.storage.download = async (_url, path, _progress, signal) => {
    started();
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    f.files.set(path, 'valid');
    return 200;
  };
  const operation = f.store.ensure();
  await downloading;
  await f.store.pause();
  await operation;
  assert.equal(f.store.getSnapshot().status, 'paused');
  assert.equal(f.files.size, 0);
  const fresh = new LocalModelStore(model, f.storage);
  await fresh.ensure();
  assert.equal(fresh.getSnapshot().status, 'paused');
});
test('explicit retry clears pause and downloads', async () => {
  const f = fixture();
  await f.store.pause();
  await f.store.ensure();
  assert.equal(f.store.getSnapshot().status, 'paused');
  await f.store.ensure(true, true);
  assert.equal(f.store.getSnapshot().status, 'ready');
});
test('deleted model is not reported as a usable path', async () => {
  const f = fixture();
  await f.store.ensure();
  f.files.clear();
  await assert.rejects(f.store.path());
});
test('pinned model is a public HTTPS weights URL with SHA256 and exact size', () => {
  assert.equal(new URL(localModel.url).protocol, 'https:');
  assert.match(localModel.url, /\/resolve\/[0-9a-f]{40}\/.*\.gguf$/);
  assert.match(localModel.sha256, /^[0-9a-f]{64}$/);
  assert.equal(localModel.bytes, 484220320);
});
test('local outputs stay in the same category contract; invalid/unclear is manual', () => {
  assert.deepEqual(readCategory('{"category":"food","amount":999}'), {
    status: 'classified',
    category: 'Food & drinks',
  });
  for (const value of [
    '{"category":"unclear"}',
    '{"category":"__proto__"}',
    '{}',
    'null',
    'bad json',
  ])
    assert.equal(readCategory(value).status, 'needs-input');
  const messages = categoryMessages('  dentist visit  ');
  assert.equal(messages.at(-1)?.content, 'dentist visit');
  assert.equal(messages[0].role, 'system');
  assert.equal(categorySchema.additionalProperties, false);
});
test('receipt review independently reads OCR, never sees the draft and cannot approve mismatched finances', () => {
  const draft = {
    merchant: 'Corner Cafe',
    amount: 12.5,
    currency: 'SGD',
    date: '2026-11-19',
    category: 'Other',
    notes: '',
  };
  const fields = { merchant: 'Corner Cafe', total: '12.50', currency: 'SGD', date: '2026-11-19' };
  assert.equal(receiptReviewMatches(JSON.stringify(fields), draft), true);
  assert.equal(
    receiptReviewMatches(JSON.stringify({ ...fields, date: '19 Nov 2026' }), draft),
    true,
  );
  for (const change of [
    { total: '15.00' },
    { currency: 'USD' },
    { date: '2026-11-18' },
    { merchant: 'Other Shop' },
    { total: '' },
    { currency: '' },
    { date: '' },
  ])
    assert.equal(receiptReviewMatches(JSON.stringify({ ...fields, ...change }), draft), false);
  assert.equal(receiptReviewMatches('{"approved":true}', draft), false);
  assert.equal(receiptReviewMatches(JSON.stringify(fields), { ...draft, amount: 99 }), false);
  assert.equal(receiptReviewMatches('null', draft), false);
  const messages = receiptReviewMessages({
    engine: 'apple-vision',
    width: 100,
    height: 100,
    lines: [
      { text: 'TOTAL SGD 12.50', confidence: 0.99, bounds: { x: 0, y: 0, width: 1, height: 1 } },
    ],
  });
  assert.equal(messages[1].content, 'TOTAL SGD 12.50');
  assert(!JSON.stringify(messages).includes('draft'));
});
