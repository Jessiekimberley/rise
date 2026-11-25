import { loadEnvFile } from 'node:process';
import { neonQuery } from '../lib/neon';
import { programmeSchema, schema } from '../lib/storage';

try { loadEnvFile('.env.local'); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const statements = [schema, programmeSchema];
const localDatabase = process.env.RISE_LOCAL_DATABASE;
if (!process.env.DATABASE_URL && localDatabase) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = new PGlite(localDatabase);
  await database.exec(statements.join('\n'));
  await database.close();
  console.log('Rise Training local database schema is ready.');
} else {
  for (const statement of statements) await neonQuery()(statement);
  console.log('Rise Training database schema is ready.');
}
