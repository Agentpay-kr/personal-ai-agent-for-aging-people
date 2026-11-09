// Opt-in recording build. Production builds continue to reject demo servers.
export const demoBuild = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
export function acceptRuntime(status: { mode: string; simulation?: boolean }, baseUrl: string) {
  if (status.mode === 'live') return true;
  return demoBuild && status.mode === 'local-demo' && status.simulation === true && ['localhost', '127.0.0.1', '10.0.2.2'].includes(new URL(baseUrl).hostname);
}
export function demoCredentials() {
  let actor = 'mom';
  if (typeof window !== 'undefined') { const selected = new URLSearchParams(window.location.search).get('demoOwner'); if (selected && ['mom', 'dad', 'son'].includes(selected)) actor = selected; }
  return { baseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4319', token: `demo-${actor}` };
}
