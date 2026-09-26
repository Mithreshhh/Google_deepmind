import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Root .env first, then server/.env as a fallback. Real env vars always win.
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '.env'), quiet: true });
