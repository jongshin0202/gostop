// Development authority entrypoint. Production worker and frozen game files unchanged.
import worker from './worker.mjs';
export {GameRoom,BackupStore} from './worker.mjs';
export {AccountStore} from './development-account-store.mjs';
export {Lobby} from './lobby-development.mjs';
export default worker;
