import type { State } from '../finance';
import type { CaptureEvent } from '../transaction-capture';
import type { CaptureStatus } from '../../modules/pocket-transaction-capture';
export const captureStatus = async (): Promise<CaptureStatus> => ({
  available: false,
  granted: false,
  dropped: 0,
  apps: [],
});
export const configureCapture = async (_owner: string, _packages: string[]) => {};
export const openCaptureSettings = async () => {};
export const pendingCaptures = async (_owner: string): Promise<CaptureEvent[]> => [];
export const acknowledgeCaptures = async (_owner: string, _snapshot: State) => {};
export const retryCaptureAcknowledgement = async (_owner: string) => {};
export const clearNativeCaptures = async (_owner: string) => {};
