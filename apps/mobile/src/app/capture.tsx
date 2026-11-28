import { useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { CaptureContext } from '../capture-context';
import { shortcutCanonical, shortcutCapture } from '../shortcut-capture';
import { Button, styles as u } from '../components/ui';

export default function CapturePage() {
  const params = useLocalSearchParams();
  const receive = useContext(CaptureContext);
  const router = useRouter();
  const input = JSON.stringify(params);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!receive) return;
    let active = true;
    void (async () => {
      const values = JSON.parse(input);
      const canonical = shortcutCanonical(values);
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
      const event = shortcutCapture(values, digest);
      if (!active) return;
      receive(event);
      // Remove financial parameters from the active route as soon as they are staged.
      router.replace('/tools');
    })().catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Cannot import this Shortcut.');
    });
    return () => {
      active = false;
    };
  }, [input, receive, router]);
  return (
    <View style={{ gap: 12 }}>
      <Text style={u.h2}>Purchase alert</Text>
      <Text style={u.body}>{error || 'Preparing a purchase draft for review...'}</Text>
      {!!error && <Button onPress={() => router.replace('/tools')}>Back to Tools</Button>}
    </View>
  );
}
