import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { validatedApiUrl } from './lib/config';
import { State, initialState } from './finance';
const storageKey = (uid: string) => 'pocket-budget.v2.' + encodeURIComponent(uid);
export async function load(uid: string): Promise<State> {
  const raw = await AsyncStorage.getItem(storageKey(uid));
  if (!raw) return { ...initialState };
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    !Array.isArray(data.goals) ||
    !Array.isArray(data.bills)
  )
    throw new Error('Local account data is invalid.');
  const { model: legacyModel, ...account } = data;
  let apiUrl = initialState.apiUrl;
  try {
    apiUrl = validatedApiUrl(account.apiUrl);
  } catch {}
  return { ...initialState, ...account, apiUrl };
}
export const persist = (s: State, uid: string) =>
  AsyncStorage.setItem(storageKey(uid), JSON.stringify(s));
export async function removeLegacyProviderKey() {
  if (Platform.OS === 'web') sessionStorage.removeItem('pocket-openai-key');
  else await SecureStore.deleteItemAsync('pocket-openai-key');
}
