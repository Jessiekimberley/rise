import { NextResponse } from 'next/server';
import { hasAccess, isSameOrigin, ownerId } from '@/lib/access';
import { commandSchema, TrainingValidationError } from '@/lib/model';
import { productionStore } from '@/lib/neon';

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !await hasAccess()) return NextResponse.json({ error: 'Open your private Rise link again.' }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || ['preparePublish', 'markPublished'].includes(parsed.data.type)) {
    return NextResponse.json({ error: 'Some of the values could not be saved. Check the entry and try again.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await productionStore().mutate(ownerId, parsed.data));
  } catch (error) {
    if (error instanceof TrainingValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Rise Training storage failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Could not save to your log. Try again.' }, { status: 503 });
  }
}
