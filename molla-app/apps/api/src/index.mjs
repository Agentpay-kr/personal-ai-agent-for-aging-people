import { createApi } from './server.mjs';

const host = process.env.MOLLA_HOST || '127.0.0.1';
if (process.env.MOLLA_ENV === 'development' && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Development HTTP must bind to loopback');
if (process.env.MOLLA_ENV !== 'development' && !(process.env.MOLLA_TLS_CERT && process.env.MOLLA_TLS_KEY) && !(process.env.MOLLA_TRUST_LOOPBACK_PROXY === '1' && ['127.0.0.1', '::1'].includes(host))) throw new Error('Production requires TLS certificates or a trusted loopback HTTPS proxy');
const app = createApi();
app.server.listen(Number(process.env.PORT || 4319), host, () => console.log(`Molla owner API listening on ${host}:${app.server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
