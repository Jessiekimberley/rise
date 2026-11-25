import { NextResponse } from 'next/server';
import { canSyncSteps, ownerId } from '@/lib/access';
import { todayKey } from '@/lib/insights';
import { stepSyncSchema } from '@/lib/model';
import { productionStore } from '@/lib/neon';

export async function POST(request: Request) {
  if (!canSyncSteps(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Check the step sync key in your Shortcut.' }, { status: 401 });
  }
  const entry = stepSyncSchema.safeParse(await request.json().catch(() => null));
  if (!entry.success || entry.data.date > todayKey()) {
    return NextResponse.json({ error: 'Send a date in YYYY-MM-DD format and a whole-number step total for today or an earlier day.' }, { status: 400 });
  }
  try {
    await productionStore().mutate(ownerId, { type: 'syncSteps', ...entry.data });
    return NextResponse.json(entry.data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Rise step sync failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Could not save your steps. Try again.' }, { status: 503 });
  }
}
