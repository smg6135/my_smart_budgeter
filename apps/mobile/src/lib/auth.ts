import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export type Session = {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  emailVerified?: boolean;
};
const KEY = 'pocket-auth-session.v1';
const project = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
const emulator = process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL;
if (emulator && !__DEV__) throw new Error('Auth emulator forbidden in release builds');
export const authConfigured = !!project && !!apiKey;
let session: Session | null = null;
let refreshPromise: Promise<string> | null = null;
const subscribers = new Set<(s: Session | null) => void>();
let generation = 0;
let storageQueue: Promise<void> = Promise.resolve();
async function store(value: Session | null) {
  if (Platform.OS === 'web') {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } else if (value)
    await SecureStore.setItemAsync(KEY, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(KEY);
}
async function publish(value: Session | null, epoch = generation) {
  const pending = storageQueue
    .catch(() => {})
    .then(async () => {
      if (epoch !== generation) return;
      await store(value);
      if (epoch !== generation) return;
      session = value;
      for (const fn of subscribers) fn(value);
    });
  storageQueue = pending;
  await pending;
}
export function subscribeAuth(fn: (s: Session | null) => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
export async function restoreSession() {
  const raw =
    Platform.OS === 'web' ? sessionStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (
        typeof s.uid === 'string' &&
        typeof s.refreshToken === 'string' &&
        typeof s.idToken === 'string' &&
        Number.isFinite(s.expiresAt)
      )
        session = s;
    } catch {
      await store(null);
    }
  }
  return session;
}
async function identity(path: string, body: Record<string, unknown>) {
  if (!authConfigured) throw new Error('Authentication is not configured.');
  const base = emulator
    ? emulator.replace(/\/$/, '') + '/identitytoolkit.googleapis.com'
    : 'https://identitytoolkit.googleapis.com';
  const result = await fetch(`${base}/v1/${path}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok) {
    const code = data.error?.message || '';
    throw new Error(
      code.includes('EMAIL_EXISTS')
        ? 'Email already registered.'
        : code.includes('WEAK_PASSWORD')
          ? 'Use at least 8 characters.'
          : code.includes('TOO_MANY')
            ? 'Too many attempts. Try later.'
            : 'Sign-in failed. Check your email and password.',
    );
  }
  return data;
}
function providerSession(data: Record<string, unknown>): Session {
  if (
    typeof data.localId !== 'string' ||
    !data.localId ||
    typeof data.email !== 'string' ||
    typeof data.idToken !== 'string' ||
    !data.idToken ||
    typeof data.refreshToken !== 'string' ||
    !data.refreshToken ||
    !Number.isFinite(Number(data.expiresIn)) ||
    Number(data.expiresIn) <= 0
  )
    throw new Error('Sign-in incomplete. Use your existing sign-in method.');
  return {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
  };
}
export async function signIn(email: string, password: string, register = false) {
  if (register && password.length < 8) throw new Error('Use at least 8 characters.');
  const epoch = ++generation;
  const data = await identity(register ? 'accounts:signUp' : 'accounts:signInWithPassword', {
    email: email.trim(),
    password,
    returnSecureToken: true,
  });
  if (epoch !== generation) return;
  await publish(providerSession(data), epoch);
  if (register && epoch === generation) await sendVerification();
}
export async function googleLogin() {
  const epoch = ++generation;
  const { googleSession } = await import('./google');
  const data = await googleSession();
  if (epoch !== generation) return;
  await publish(data, epoch);
}
export async function exchangeGoogleToken(idToken: string): Promise<Session> {
  return exchangeGoogleCredential(idToken, 'id_token');
}
export async function exchangeGoogleAccessToken(accessToken: string): Promise<Session> {
  return exchangeGoogleCredential(accessToken, 'access_token');
}
async function exchangeGoogleCredential(token: string, kind: string): Promise<Session> {
  const data = await identity('accounts:signInWithIdp', {
    postBody: kind + '=' + encodeURIComponent(token) + '&providerId=google.com',
    requestUri:
      'https://' + (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || project + '.firebaseapp.com'),
    returnIdpCredential: false,
    returnSecureToken: true,
  });
  return providerSession(data);
}
export async function signOut() {
  generation++;
  await publish(null);
}
export function currentSession() {
  return session;
}
export async function getAccessToken(force = false): Promise<string> {
  if (!session) throw new Error('Sign in required.');
  if (!force && session.expiresAt > Date.now() + 60000) return session.idToken;
  if (refreshPromise) return refreshPromise;
  const previous = session,
    epoch = generation;
  refreshPromise = (async () => {
    const base = emulator
      ? emulator.replace(/\/$/, '') + '/securetoken.googleapis.com'
      : 'https://securetoken.googleapis.com';
    const response = await fetch(`${base}/v1/token?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(previous.refreshToken),
    });
    if (!response.ok) {
      if (epoch === generation) await signOut();
      throw new Error('Session expired. Sign in again.');
    }
    const data = await response.json();
    if (epoch !== generation) throw new Error('Session changed.');
    await publish(
      {
        ...previous,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + Number(data.expires_in) * 1000,
      },
      epoch,
    );
    if (epoch !== generation) throw new Error('Session changed.');
    return data.id_token as string;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
export async function resetPassword(email: string) {
  await identity('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: email.trim() });
}

export async function sendVerification() {
  await identity('accounts:sendOobCode', {
    requestType: 'VERIFY_EMAIL',
    idToken: await getAccessToken(),
  });
}
