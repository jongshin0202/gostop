// Development authority entrypoint. Production worker and frozen game files unchanged.
import worker from './worker.mjs';
export {GameRoom,AccountStore,BackupStore} from './worker.mjs';
export {Lobby} from './lobby-development.mjs';
export default worker;
