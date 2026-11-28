// A foreground check alone misses a lock/unlock while native initialization awaits.
export class AiLifecycle {
  private epoch = 0;
  constructor(private readonly active: () => boolean) {}
  interrupt() {
    this.epoch++;
  }
  checkpoint() {
    const epoch = this.epoch;
    const check = () => {
      if (!this.active() || epoch !== this.epoch)
        throw new Error('Reopen the app to use local AI.');
    };
    check();
    return check;
  }
}

// llama.rn's declared Promise return can actually be void in the native JSI binding.
// await accepts both and also catches a synchronous native/JSI exception.
export async function stopLocalCompletion(stop: () => unknown): Promise<void> {
  try {
    await stop();
  } catch {
    // Suspension must still release the context if stopping fails.
  }
}

export async function waitForForeground(
  active: () => boolean,
  subscribe: (listener: () => void) => () => void,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error('Receipt processing cancelled.');
  if (active()) return;
  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    const cleanup = () => {
      unsubscribe();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error('Receipt processing cancelled.'));
    };
    const changed = () => {
      if (active()) {
        cleanup();
        resolve();
      }
    };
    unsubscribe = subscribe(changed);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else changed();
  });
}
