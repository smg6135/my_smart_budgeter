import { AppState, Platform } from 'react-native';
import { waitForForeground } from '../ai-lifecycle';

// Pause between stages; never start another image or local model while locked.
export const receiptForeground = (signal: AbortSignal) =>
  waitForForeground(
    () => Platform.OS === 'web' || AppState.currentState === 'active',
    (changed) => {
      const listener = AppState.addEventListener('change', changed);
      return () => listener.remove();
    },
    signal,
  );
