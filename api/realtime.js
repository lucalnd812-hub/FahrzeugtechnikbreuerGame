import {createRealtimeServer} from '../server/realtime.js';

// Native Node HTTP servers support WebSocket upgrades on Vercel (public beta).
// The narrowly scoped vercel.json rule gives this endpoint 300 seconds.
export const config={maxDuration:300};
export default createRealtimeServer();
