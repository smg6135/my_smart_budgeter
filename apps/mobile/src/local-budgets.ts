import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { budgetChoices } from './saved-budget-selection';
import type { SavedBudget } from './saved-budget-selection';
export type { SavedBudget } from './saved-budget-selection';
const selectionKey = 'pocket-budget.selected.v1';
const legacySessionKey = 'pocket-auth-session.v1';
export async function savedBudgets() {
  const keys = await AsyncStorage.getAllKeys();
  const saved = await AsyncStorage.getItem(selectionKey);
  // Read only the old UID to retain the active namespace. Never refresh credentials.
  let uid: string | undefined;
  try {
    const raw =
      Platform.OS === 'web'
        ? sessionStorage.getItem(legacySessionKey)
        : await SecureStore.getItemAsync(legacySessionKey);
    const value = raw ? JSON.parse(raw) : null;
    if (typeof value?.uid === 'string') uid = value.uid;
  } catch {}
  const result = budgetChoices(keys, saved, uid);
  // Commit selection before removing obsolete credentials; budget payloads never move.
  await selectBudget(result.selected);
  try {
    if (Platform.OS === 'web') sessionStorage.removeItem(legacySessionKey);
    else await SecureStore.deleteItemAsync(legacySessionKey);
  } catch {}
  return result;
}
export const selectBudget = (budget: SavedBudget) => AsyncStorage.setItem(selectionKey, budget.key);
