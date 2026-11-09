import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
const forbidden=()=>{throw new Error('WEB_RUNTIME_FORBIDDEN_IN_TEST');};
globalThis.fetch=forbidden;globalThis.WebSocket=forbidden;
http.Server.prototype.listen=forbidden;net.Server.prototype.listen=forbidden;
http.request=forbidden;http.get=forbidden;https.request=forbidden;https.get=forbidden;
