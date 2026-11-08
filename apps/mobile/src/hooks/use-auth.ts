import { useEffect, useState } from 'react';
import { restoreSession, Session, subscribeAuth } from '../lib/auth';
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeAuth((s) => {
      if (mounted) setSession(s);
    });
    restoreSession()
      .then((s) => {
        if (mounted) setSession(s);
      })
      .catch(() => {
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  return { session, loading };
}
