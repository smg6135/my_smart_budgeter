import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { CaptureStatus } from '../../modules/pocket-transaction-capture';
import {
  captureStatus,
  configureCapture,
  pendingCaptures,
  retryCaptureAcknowledgement,
} from '../lib/transaction-capture';
import { receiveCaptures } from '../transaction-capture';
import type { State } from '../finance';

export function useTransactionCapture(
  owner: string,
  packages: string[] | undefined,
  update: (fn: (s: State) => State) => void,
) {
  const [status, setStatus] = useState<CaptureStatus>({
    available: false,
    granted: false,
    dropped: 0,
    apps: [],
  });
  const [error, setError] = useState('');
  const ready = packages !== undefined;
  const selection = JSON.stringify(packages || []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !ready) return;
    let mounted = true;
    let busy = false;
    async function refresh() {
      if (!mounted || busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const value = await captureStatus();
        if (!mounted) return;
        setStatus(value);
        const events = await pendingCaptures(owner);
        if (!mounted) return;
        if (events.length) update((old) => receiveCaptures(old, events));
        await retryCaptureAcknowledgement(owner);
        setError('');
      } catch {
        if (mounted) setError('Could not read purchase alerts. Your saved budget is unchanged.');
      } finally {
        busy = false;
      }
    }
    void configureCapture(owner, JSON.parse(selection))
      .then(refresh)
      .catch(() => {
        if (mounted) setError('Could not configure purchase alerts.');
      });
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      mounted = false;
      listener.remove();
      clearInterval(timer);
    };
    // update is AppContent's stable setState wrapper; changing selection restarts acquisition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, selection, ready]);
  return { ...status, error: error || status.error };
}
