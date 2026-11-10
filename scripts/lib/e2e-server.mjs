/** Shared Playwright test server: static files + map API. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { start } = require('../dev-server.cjs');
export { start };
