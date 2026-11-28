import type { State } from './finance';
import { parseCaptureEvent, type CaptureEvent } from './transaction-capture';

// The native queue is at-least-once. Acknowledgement is permitted only against a
// snapshot whose device-ledger persistence has already succeeded.
export class CaptureAcknowledgements {
  private readonly saved = new Map<string, Set<string>>();
  constructor(
    private readonly port: {
      pending(owner: string): Promise<CaptureEvent[]>;
      acknowledge(owner: string, ids: string[]): Promise<void>;
    },
  ) {}
  async persisted(owner: string, snapshot: State) {
    this.saved.set(
      owner,
      new Set([
        ...(snapshot.captures || []).flatMap((r) => r.sourceIds),
        ...snapshot.entries.flatMap((e) => e.capture?.sourceIds || []),
      ]),
    );
    await this.retry(owner);
  }
  async retry(owner: string) {
    const known = this.saved.get(owner);
    if (!known) return;
    const pending = await this.port.pending(owner);
    const ids = pending.filter((e) => known.has(e.id) || !parseCaptureEvent(e)).map((e) => e.id);
    if (ids.length) await this.port.acknowledge(owner, ids);
  }
  forget(owner: string) {
    this.saved.delete(owner);
  }
}
