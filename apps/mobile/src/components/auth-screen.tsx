import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authConfigured, googleLogin, resetPassword, signIn } from '../lib/auth';
import { Button, Card, Field, C, styles as u } from './ui';
export function AuthScreen() {
  useEffect(() => {
    if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
      void import('../lib/google').then((module) => module.prepareGoogle()).catch(() => {});
  }, []);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}
        >
          <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
            <Card>
              <Text accessibilityRole="header" style={u.h1}>
                {register ? 'Create account' : 'Sign in'}
              </Text>
              {!authConfigured && (
                <Text style={u.body}>
                  Authentication configuration required. See the deployment guide.
                </Text>
              )}
              <Field label="Email" value={email} onChangeText={setEmail} />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
              {!!error && (
                <Text accessibilityRole="alert" style={[u.body, { color: C.red }]}>
                  {error}
                </Text>
              )}
              <Button
                disabled={busy || !authConfigured}
                onPress={() => void run(() => signIn(email, password, register))}
              >
                {register ? 'Create account' : 'Sign in'}
              </Button>
              <Button
                secondary
                disabled={busy || !authConfigured}
                onPress={() => void run(googleLogin)}
              >
                Continue with Google
              </Button>
              <Button secondary disabled={busy} onPress={() => setRegister(!register)}>
                {register ? 'Use existing account' : 'Create account'}
              </Button>
              <Button
                secondary
                disabled={busy || !email}
                onPress={() =>
                  void run(async () => {
                    await resetPassword(email);
                    setError('Password reset email sent.');
                  })
                }
              >
                Reset password
              </Button>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
