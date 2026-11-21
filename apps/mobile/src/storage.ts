import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { validatedApiUrl } from './lib/config';
import { State, initialState } from './finance';
import { migratePlans } from './plans';
const storageKey = (uid: string, local = false) =>
  local ? 'pocket-budget.local.v1' : 'pocket-budget.v2.' + encodeURIComponent(uid);
export async function load(uid: string, local = false): Promise<State> {
  const raw = await AsyncStorage.getItem(storageKey(uid, local));
  if (!raw) return migratePlans({ ...initialState });
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
  return migratePlans({ ...initialState, ...account, apiUrl });
}
export const persist = (s: State, uid: string, local = false) =>
  AsyncStorage.setItem(storageKey(uid, local), JSON.stringify(s));
export async function removeLegacyProviderKey() {
  if (Platform.OS === 'web') sessionStorage.removeItem('pocket-openai-key');
  else await SecureStore.deleteItemAsync('pocket-openai-key');
}
