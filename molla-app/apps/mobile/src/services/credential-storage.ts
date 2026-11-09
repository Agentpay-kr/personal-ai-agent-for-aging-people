import * as SecureStore from 'expo-secure-store';
import type { Credentials } from './runtime';

const key = 'molla.live.credentials.v1';
export async function loadCredentials(): Promise<Credentials | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  const parsed = JSON.parse(value);
  return typeof parsed?.baseUrl === 'string' && typeof parsed?.token === 'string' ? parsed : null;
}
export async function saveCredentials(value: Credentials) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function clearCredentials() { await SecureStore.deleteItemAsync(key); }
