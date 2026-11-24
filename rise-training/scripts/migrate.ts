import { loadEnvFile } from 'node:process';
import { neonQuery } from '../lib/neon';
import { schema } from '../lib/storage';

try { loadEnvFile('.env.local'); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
await neonQuery()(schema);
console.log('Rise Training database schema is ready.');
