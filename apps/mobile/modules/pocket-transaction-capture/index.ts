import { requireOptionalNativeModule } from 'expo';
import type { CaptureEvent } from '../../src/transaction-capture';

export type CaptureStatus = {
  available: boolean;
  granted: boolean;
  dropped: number;
  error?: string;
  apps: { packageName: string; label: string }[];
};
export default requireOptionalNativeModule<{
  status(): Promise<CaptureStatus>;
  configure(owner: string, packages: string[]): Promise<void>;
  openSettings(): Promise<void>;
  pending(owner: string): Promise<CaptureEvent[]>;
  acknowledge(owner: string, ids: string[]): Promise<void>;
  clear(owner: string): Promise<void>;
}>('PocketTransactionCapture');
