import native from '../../modules/pocket-transaction-capture';
import type { State } from '../finance';
import { CaptureAcknowledgements } from '../capture-acknowledgements';

export const captureStatus = async () =>
  native ? native.status() : { available: false, granted: false, dropped: 0, apps: [] };
export const configureCapture = async (owner: string, packages: string[]) => {
  await native?.configure(owner, packages);
};
export const openCaptureSettings = async () => {
  await native?.openSettings();
};
export const pendingCaptures = async (owner: string) => (native ? native.pending(owner) : []);
const acknowledgements = new CaptureAcknowledgements({
  pending: pendingCaptures,
  acknowledge: async (owner, ids) => {
    await native?.acknowledge(owner, ids);
  },
});
export async function acknowledgeCaptures(owner: string, snapshot: State) {
  if (!native) return;
  await acknowledgements.persisted(owner, snapshot);
}
export const retryCaptureAcknowledgement = (owner: string) => acknowledgements.retry(owner);
export const clearNativeCaptures = async (owner: string) => {
  acknowledgements.forget(owner);
  await native?.clear(owner);
};
