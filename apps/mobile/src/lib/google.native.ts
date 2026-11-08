import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { exchangeGoogleToken, Session } from './auth';
export async function googleSession(): Promise<Session> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw new Error('Google sign-in is not configured.');
  GoogleSignin.configure({
    webClientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result) || !result.data.idToken)
    throw new Error('Google sign-in cancelled.');
  const session = await exchangeGoogleToken(result.data.idToken);
  await GoogleSignin.signOut();
  return session;
}

export async function prepareGoogle() {}
