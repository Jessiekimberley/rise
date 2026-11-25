import { applyCommand, createData, type Command, type TrainingData, type TrainingSnapshot } from './model';

import { applyProgramme, programmeCommandSchema, ProgrammeValidationError, type ProgrammeCommand, type ProgrammeSnapshot } from './prescription';
import type { Plan } from './programme';

export const schema = `
  CREATE TABLE IF NOT EXISTS rise_training_logs (
    user_id text PRIMARY KEY,
    state jsonb NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

export const programmeSchema = `
  CREATE TABLE IF NOT EXISTS rise_programme (
    user_id text PRIMARY KEY,
    state jsonb NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

type Result = Record<string, unknown>;
export type Query = (text: string, values?: unknown[]) => Promise<Result[]>;

export function trainingLogView(snapshot: TrainingSnapshot, canManageDocs: boolean): TrainingSnapshot {
  if (canManageDocs) return snapshot;
  const { docs, checkIns, ...data } = snapshot.data;
  const sharedCheckIns = Object.fromEntries(Object.entries(checkIns).map(([id, { publishTarget, ...checkIn }]) => [id, checkIn]));
  return { ...snapshot, data: { ...data, checkIns: sharedCheckIns } };
}

export function trainingStore(query: Query) {
  async function load(userId: string): Promise<TrainingSnapshot> {
    const [row] = await query('SELECT state, revision FROM rise_training_logs WHERE user_id = $1', [userId]);
    return row ? { revision: Number(row.revision), data: row.state as TrainingData } : { revision: 0, data: createData() };
  }

  return {
    load,
    async mutate(userId: string, command: Command, prescription?: ProgrammeSnapshot | null): Promise<TrainingSnapshot> {
      const now = new Date().toISOString();
      for (let attempt = 0; attempt < 6; attempt++) {
        const { revision, data } = await load(userId);
        applyCommand(data, command, now, prescription);
        const [saved] = await query(revision === 0 ? `
          INSERT INTO rise_training_logs (user_id, state, revision) VALUES ($1, $2::jsonb, $3 + 1)
          ON CONFLICT (user_id) DO NOTHING RETURNING revision
        ` : `
          UPDATE rise_training_logs SET state = $2::jsonb, revision = revision + 1, updated_at = now()
          WHERE user_id = $1 AND revision = $3 RETURNING revision
        `, [userId, JSON.stringify(data), revision]);
        if (saved) return { revision: Number(saved.revision), data };
      }
      throw new Error('Another device is updating your log. Try saving again.');
    },
  };
}

function missingProgrammeTable(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = String(record.message ?? '');
  return record.code === '42P01' || (/rise_programme/i.test(message) && /does not exist/i.test(message));
}

export function programmeStore(query: Query) {
  async function load(userId: string): Promise<ProgrammeSnapshot> {
    try {
      const [row] = await query('SELECT state, revision FROM rise_programme WHERE user_id = $1', [userId]);
      return row ? { revision: Number(row.revision), state: row.state as ProgrammeSnapshot['state'] } : { revision: 0, state: { revisions: [], messages: [] } };
    } catch (error) {
      if (missingProgrammeTable(error)) return { revision: 0, state: { revisions: [], messages: [] } };
      throw error;
    }
  }

  return {
    load,
    async mutate(userId: string, command: ProgrammeCommand, livePlans?: readonly Plan[]): Promise<ProgrammeSnapshot> {
      const parsed = programmeCommandSchema.safeParse(command);
      if (!parsed.success) throw new ProgrammeValidationError('Check the programme and try again.');
      const now = new Date().toISOString();
      try {
        for (let attempt = 0; attempt < 6; attempt++) {
          const { revision, state } = await load(userId);
          const next = applyProgramme(state, parsed.data, now, livePlans);
          if (revision > 0 && JSON.stringify(next) === JSON.stringify(state)) return { revision, state };
          const [saved] = await query(revision === 0 ? `
            INSERT INTO rise_programme (user_id, state, revision) VALUES ($1, $2::jsonb, $3 + 1)
            ON CONFLICT (user_id) DO NOTHING RETURNING revision
          ` : `
            UPDATE rise_programme SET state = $2::jsonb, revision = revision + 1, updated_at = now()
            WHERE user_id = $1 AND revision = $3 RETURNING revision
          `, [userId, JSON.stringify(next), revision]);
          if (saved) return { revision: Number(saved.revision), state: next };
        }
      } catch (error) {
        if (error instanceof ProgrammeValidationError) throw error;
        if (missingProgrammeTable(error)) throw new ProgrammeValidationError('Programme storage is not ready. Run pnpm db:migrate.');
        throw error;
      }
      throw new Error('Another device is updating the programme. Try saving again.');
    },
  };
}
