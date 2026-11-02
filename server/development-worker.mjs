// Development authority entrypoint. Production worker and frozen game files unchanged.
import worker from './worker.mjs';
export {BackupStore} from './worker.mjs';
export {GameRoom} from './development-game-room.mjs';
export {AccountStore} from './development-account-store.mjs';
export {Lobby} from './lobby-development.mjs';
export default worker;
