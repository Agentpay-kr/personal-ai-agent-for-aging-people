import { localDev } from 'eve/channels/auth';
import { eveChannel } from 'eve/channels/eve';
// Operator-local only. Production must supply per-user verified auth and session ownership.
export default eveChannel({ auth: [localDev()] });
