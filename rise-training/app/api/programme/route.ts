import { NextResponse } from 'next/server';
import { isSameOrigin, ownerId } from '@/lib/access';
import { todayKey } from '@/lib/insights';
import { productionProgramme, productionStore } from '@/lib/neon';
import { ProgrammeValidationError } from '@/lib/prescription';
import { availableWeek } from '@/lib/weeks';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Open Rise Training to save the programme.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const date = typeof body?.effectiveFrom === 'string' ? body.effectiveFrom : todayKey();
  try {
    const training = await productionStore().load(ownerId);
    const snapshot = await productionProgramme().mutate(ownerId, body, availableWeek(training.data, date)?.plans);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof ProgrammeValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Rise programme save failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Could not save the programme. Try again.' }, { status: 503 });
  }
}
