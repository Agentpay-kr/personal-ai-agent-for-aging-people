import type { Credentials } from './runtime';

// Browser rendering is a review surface. Do not persist a bearer token in Web Storage.
let current: Credentials | null = null;
export async function loadCredentials() { return current; }
export async function saveCredentials(value: Credentials) { current = value; }
export async function clearCredentials() { current = null; }
