import { neon } from '@neondatabase/serverless';
import { schema, trainingStore, type Query } from './storage';

let localQuery: Promise<Query> | undefined;

function developmentQuery(path: string): Promise<Query> {
  localQuery ??= import('@electric-sql/pglite').then(async ({ PGlite }) => {
    const database = new PGlite(path);
    await database.exec(schema);
    return async (sql, values) => (await database.query<Record<string, unknown>>(sql, values)).rows;
  });
  return localQuery;
}

export function neonQuery() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Neon database connection is missing.');
  return neon(url).query;
}

export function productionStore() {
  const localDatabase = process.env.RISE_LOCAL_DATABASE;
  if (process.env.NODE_ENV === 'development' && localDatabase) {
    return trainingStore(async (sql, values) => (await developmentQuery(localDatabase))(sql, values));
  }
  return trainingStore(neonQuery());
}
