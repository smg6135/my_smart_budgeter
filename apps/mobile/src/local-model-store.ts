// Model acquisition only. Expense descriptions and OCR never enter this interface.
export type ModelSpec = {
  id: string;
  name: string;
  url: string;
  bytes: number;
  sha256: string;
  notices?: unknown;
};
export type ModelState = {
  status: 'waiting' | 'downloading' | 'verifying' | 'ready' | 'paused' | 'error';
  progress: number;
  reason?: string;
};
export class ModelNetworkWait extends Error {}
export interface ModelStorage {
  path: string;
  prepare(): Promise<void>;
  exists(path: string): Promise<boolean>;
  verify(path: string, model: ModelSpec): Promise<boolean>;
  freeBytes(): Promise<number>;
  network(): Promise<'wifi' | 'cellular' | 'offline'>;
  paused(): Promise<boolean>;
  setPaused(value: boolean): Promise<void>;
  remove(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  download(
    url: string,
    path: string,
    progress: (bytes: number) => void,
    signal: AbortSignal,
    allowCellular: boolean,
  ): Promise<number>;
}

export class LocalModelStore {
  private state: ModelState = { status: 'waiting', progress: 0 };
  private listeners = new Set<() => void>();
  private operation?: Promise<void>;
  private controller?: AbortController;
  private verified = false;
  private paused = false;
  private initialized = false;
  constructor(
    readonly model: ModelSpec,
    private readonly storage: ModelStorage,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: ModelState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  // Polling/reconnects share one operation and never create duplicate downloads.
  ensure = (allowCellular = false, retry = false): Promise<void> => {
    if (this.operation) return this.operation;
    if (this.verified || (!retry && this.state.status === 'error')) return Promise.resolve();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.operation = this.acquire(allowCellular, retry, signal).finally(() => {
      this.operation = undefined;
      this.controller = undefined;
    });
    return this.operation;
  };
  private async acquire(allowCellular: boolean, retry: boolean, signal: AbortSignal) {
    const partial = `${this.storage.path}.part`;
    try {
      if (!this.initialized) {
        this.paused = await this.storage.paused();
        this.initialized = true;
      }
      if (retry) {
        this.paused = false;
        await this.storage.setPaused(false);
      }
      if (this.paused || signal.aborted) {
        this.update({ status: 'paused', progress: 0, reason: 'Local AI download paused.' });
        return;
      }
      await this.storage.prepare();
      if (await this.storage.exists(this.storage.path)) {
        this.update({ status: 'verifying', progress: 1, reason: 'Checking local AI…' });
        if (await this.storage.verify(this.storage.path, this.model)) {
          if (!signal.aborted) {
            this.verified = true;
            this.update({ status: 'ready', progress: 1 });
          }
          return;
        }
        await this.storage.remove(this.storage.path);
      }
      const network = await this.storage.network();
      if (network === 'offline' || (network !== 'wifi' && !allowCellular)) {
        this.update({
          status: 'waiting',
          progress: 0,
          reason:
            network === 'offline'
              ? 'Connect to Wi-Fi to install local AI.'
              : 'Local AI will download on Wi-Fi.',
        });
        return;
      }
      // Restart interrupted partial files; only verified complete files become installed.
      await this.storage.remove(partial);
      if ((await this.storage.freeBytes()) < this.model.bytes + 100 * 1024 * 1024)
        throw new Error('Free more storage, then retry local AI.');
      if (signal.aborted) return;
      this.update({ status: 'downloading', progress: 0, reason: 'Downloading local AI…' });
      const status = await this.storage.download(
        this.model.url,
        partial,
        (bytes) => {
          if (!signal.aborted)
            this.update({
              status: 'downloading',
              progress: Math.min(1, bytes / this.model.bytes),
              reason: 'Downloading local AI…',
            });
        },
        signal,
        allowCellular,
      );
      if (signal.aborted) return;
      if (status !== 200) throw new Error('Local AI download failed. Retry on Wi-Fi.');
      this.update({ status: 'verifying', progress: 1, reason: 'Checking local AI…' });
      if (!(await this.storage.verify(partial, this.model)))
        throw new Error('Local AI download is incomplete or damaged. Retry.');
      if (signal.aborted) return;
      await this.storage.move(partial, this.storage.path);
      if (signal.aborted) return;
      this.verified = true;
      this.update({ status: 'ready', progress: 1 });
    } catch (error) {
      if (!signal.aborted)
        this.update({
          status: error instanceof ModelNetworkWait ? 'waiting' : 'error',
          progress: 0,
          reason:
            error instanceof Error ? error.message : 'Local AI could not be installed. Retry.',
        });
    } finally {
      await this.storage.remove(partial).catch(() => {});
    }
  }
  async pause() {
    this.paused = true;
    this.controller?.abort();
    await this.operation;
    await this.storage.setPaused(true);
    this.update({ status: 'paused', progress: 0, reason: 'Local AI download paused.' });
  }
  async path() {
    if (!this.verified || !(await this.storage.exists(this.storage.path))) {
      this.verified = false;
      throw new Error('Local AI is not installed yet. Check Settings → On-device AI.');
    }
    return this.storage.path;
  }
}
