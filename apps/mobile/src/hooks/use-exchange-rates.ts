import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { FxSnapshot } from '../currency';
import { getRates } from '../api';
export function useExchangeRates(
  apiUrl: string | undefined,
  base: string | undefined,
  onQuote: (quote: FxSnapshot) => void,
) {
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const callback = useRef(onQuote),
    refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    callback.current = onQuote;
  }, [onQuote]);
  useEffect(() => {
    if (!apiUrl || !base) return;
    let disposed = false,
      inFlight = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (disposed || inFlight) return;
      inFlight = true;
      setLoading(true);
      controller = new AbortController();
      try {
        const quote = await getRates(apiUrl!, base!, controller.signal);
        if (!disposed) {
          callback.current(quote);
          setError('');
        }
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Exchange rates unavailable.');
      } finally {
        inFlight = false;
        if (!disposed) setLoading(false);
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === null) void refresh();
    }, 60000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      listener.remove();
    };
  }, [apiUrl, base]);
  return { loading, error, refresh: () => refreshRef.current() };
}
