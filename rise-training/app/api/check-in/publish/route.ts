import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSameOrigin, ownerId } from '@/lib/access';
import { appendCheckIn, docsConfiguration } from '@/lib/google';
import { buildReport } from '@/lib/insights';
import { productionStore } from '@/lib/neon';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Open Rise Training to send this check-in.' }, { status: 403 });
  const input = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Choose a saved check-in.' }, { status: 400 });
  try {
    const store = productionStore();
    const id = input.data.id;
    const existing = await store.load(ownerId);
    if (existing.data.checkIns[id]?.publishedAt) return NextResponse.json(existing);
    const config = docsConfiguration(existing.data.checkIns[id]?.publishTarget ?? existing.data.docs?.checkIns);
    if (!config) return NextResponse.json({ error: 'Google Docs setup is pending. Your check-in is saved in Rise Training.' }, { status: 503 });
    const target = { documentId: config.documentId, tabId: config.tabId };
    const snapshot = await store.mutate(ownerId, { type: 'preparePublish', id, target });
    const checkIn = snapshot.data.checkIns[id];
    const { title } = buildReport(snapshot.data, checkIn.kind, checkIn.start, checkIn.end);
    await appendCheckIn({ ...config, ...checkIn.publishTarget }, title, checkIn.text);
    return NextResponse.json(await store.mutate(ownerId, { type: 'markPublished', id, text: checkIn.text }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save to Google Docs.' }, { status: 502 });
  }
}
