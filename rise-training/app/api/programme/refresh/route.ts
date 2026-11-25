import { NextResponse } from 'next/server';
import { isSameOrigin, ownerId } from '@/lib/access';
import { docsConfiguration, refreshProgramme } from '@/lib/google';
import { todayKey, weekStart } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { programmeWeek } from '@/lib/weeks';
import { reviewProgramme } from '@/lib/programme-review';
import { z } from 'zod';

const inputSchema = z.object({ approve: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Open Rise Training to update the programme.' }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: 'Open the programme review and try again.' }, { status: 400 });
  try {
    const store = productionStore();
    const { data } = await store.load(ownerId);
    const config = docsConfiguration(data.docs?.programme);
    if (!config) return NextResponse.json({ error: 'Google Docs setup is pending. The supplied programme is available.' }, { status: 503 });
    const date = todayKey();
    const weeks = await refreshProgramme(config, programmeWeek(date, data.startedOn ?? weekStart(date)));
    const review = reviewProgramme(weeks, data, { documentId: config.documentId, tabId: config.tabId });
    if (!input.data.approve) return NextResponse.json(review);
    if (input.data.approve !== review.fingerprint) {
      return NextResponse.json({ error: 'The programme changed. Check for updates again before applying.' }, { status: 409 });
    }
    return NextResponse.json(await store.mutate(ownerId, { type: 'syncProgramme', weeks, date }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not refresh the programme.' }, { status: 502 });
  }
}
