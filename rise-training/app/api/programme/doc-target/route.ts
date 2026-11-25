import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSameOrigin, ownerId } from '@/lib/access';
import { docTarget } from '@/lib/coach-doc';
import { docsConfiguration, refreshProgramme, verifyCheckInTarget } from '@/lib/google';
import { todayKey, weekStart } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { programmeWeek } from '@/lib/weeks';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Open Rise Training to save this Doc.' }, { status: 403 });
  const input = z.object({ mode: z.enum(['programme', 'checkIns']), url: z.url().max(500) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Enter a Google Docs link.' }, { status: 400 });
  try {
    const { mode, url } = input.data;
    const target = docTarget(url);
    const config = docsConfiguration(target);
    if (!config) return NextResponse.json({ error: 'The app’s Google Docs access is still being set up.' }, { status: 503 });
    const store = productionStore();
    if (mode === 'programme') {
      const date = todayKey();
      const { data } = await store.load(ownerId);
      await refreshProgramme(config, programmeWeek(date, data.startedOn ?? weekStart(date)));
      return NextResponse.json(await store.mutate(ownerId, { type: 'docsTarget', mode, target }));
    }
    await verifyCheckInTarget(config);
    return NextResponse.json(await store.mutate(ownerId, { type: 'docsTarget', mode, target }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save the Google Doc link.' }, { status: 502 });
  }
}
