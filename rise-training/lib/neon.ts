import { neon } from '@neondatabase/serverless';
import { programmeSchema, programmeStore, schema, trainingStore, type Query } from './storage';

const devGlobal = globalThis as typeof globalThis & { riseLocalQueries?: Map<string, Promise<Query>> };

function developmentQuery(path: string): Promise<Query> {
  // The page and API routes can load separate copies of this module in development.
  const queries = devGlobal.riseLocalQueries ??= new Map();
  const existing = queries.get(path);
  if (existing) return existing;
  const query = import('@electric-sql/pglite').then(async ({ PGlite }) => {
    const database = new PGlite(path);
    await database.exec(`${schema}\n${programmeSchema}`);
    return (async (sql, values) => (await database.query<Record<string, unknown>>(sql, values)).rows) satisfies Query;
  }).catch((error) => {
    queries.delete(path);
    throw error;
  });
  queries.set(path, query);
  return query;
}

export function neonQuery() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Neon database connection is missing.');
  return neon(url).query;
}

export function productionProgramme() {
  const localDatabase = process.env.RISE_LOCAL_DATABASE;
  if (process.env.NODE_ENV === 'development' && localDatabase) {
    return programmeStore(async (sql, values) => (await developmentQuery(localDatabase))(sql, values));
  }
  return programmeStore(neonQuery());
}

export function productionStore() {
  const localDatabase = process.env.RISE_LOCAL_DATABASE;
  if (process.env.NODE_ENV === 'development' && localDatabase) {
    return trainingStore(async (sql, values) => (await developmentQuery(localDatabase))(sql, values));
  }
  return trainingStore(neonQuery());
}
