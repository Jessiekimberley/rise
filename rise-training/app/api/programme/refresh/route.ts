import { NextResponse } from 'next/server';
import { hasAccess, isSameOrigin, ownerId } from '@/lib/access';
import { docsConfiguration, refreshProgramme } from '@/lib/google';
import { todayKey, weekStart } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { programmeWeek } from '@/lib/weeks';

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !await hasAccess()) return NextResponse.json({ error: 'Open your private Rise link again.' }, { status: 403 });
  try {
    const store = productionStore();
    const { data } = await store.load(ownerId);
    const config = docsConfiguration(data.docs?.programme);
    if (!config) return NextResponse.json({ error: 'Google Docs setup is pending. The supplied programme is available.' }, { status: 503 });
    const date = todayKey();
    const weeks = await refreshProgramme(config, programmeWeek(date, data.startedOn ?? weekStart(date)));
    return NextResponse.json(await store.mutate(ownerId, { type: 'syncProgramme', weeks, date }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not refresh the programme.' }, { status: 502 });
  }
}
