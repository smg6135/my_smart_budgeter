import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { deviceAiAvailability } from '../lib/device-ai';
import type { DeviceAiAvailability } from '../classification';
export function useDeviceAi() {
  const [availability, setAvailability] = useState<DeviceAiAvailability>({
    available: false,
    reason: 'Checking on-device AI…',
  });
  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      void deviceAiAvailability().then((value) => {
        if (mounted) setAvailability(value);
      });
    refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  return availability;
}
