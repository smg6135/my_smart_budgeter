import { exchangeGoogleAccessToken, Session } from './auth';
type TokenResult = { access_token?: string; error?: string };
type IdentityServices = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (result: TokenResult) => void;
        error_callback: () => void;
      }) => { requestAccessToken: (options: { prompt: string }) => void };
    };
  };
};
declare global {
  interface Window {
    google?: IdentityServices;
  }
}
let loading: Promise<void> | null = null;
export function prepareGoogle() {
  if (window.google) return Promise.resolve();
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        script.remove();
        loading = null;
        reject(new Error('Google sign-in timed out.'));
      }, 15000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        loading = null;
        reject(new Error('Cannot load Google sign-in.'));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export async function googleSession(): Promise<Session> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  // Preloaded on the sign-in screen so requestAccessToken runs in the click gesture.
  if (!window.google) {
    await prepareGoogle();
    throw new Error('Google sign-in ready. Tap Continue with Google.');
  }
  const google = window.google;
  const token = await new Promise<string>((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (result) =>
          result.access_token
            ? resolve(result.access_token)
            : reject(new Error('Google sign-in failed.')),
        error_callback: () => reject(new Error('Google sign-in cancelled.')),
      })
      .requestAccessToken({ prompt: 'select_account' });
  });
  return exchangeGoogleAccessToken(token);
}
