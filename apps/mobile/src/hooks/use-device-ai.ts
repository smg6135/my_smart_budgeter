import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { deviceAiAvailability, subscribeDeviceAi } from '../lib/device-ai';
import type { DeviceAiAvailability } from '../classification';
export function useDeviceAi() {
  const [availability, setAvailability] = useState<DeviceAiAvailability>({
    available: false,
    reason: 'Checking on-device AI…',
  });
  useEffect(() => {
    let mounted = true;
    let checking = false;
    const refresh = () => {
      if (checking) return;
      checking = true;
      void deviceAiAvailability()
        .then((value) => {
          if (mounted) setAvailability(value);
        })
        .finally(() => {
          checking = false;
        });
    };
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === null) refresh();
    }, 15000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const unsubscribe = subscribeDeviceAi(refresh);
    return () => {
      mounted = false;
      listener.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  return availability;
}
