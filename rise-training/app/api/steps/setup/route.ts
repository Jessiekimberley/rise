import { NextResponse } from 'next/server';
import { hasAccess, isSameOrigin, stepSyncToken } from '@/lib/access';

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !await hasAccess()) {
    return NextResponse.json({ error: 'Open your private Rise link to set up Apple Health.' }, { status: 403 });
  }
  return NextResponse.json({ token: stepSyncToken() }, { headers: { 'Cache-Control': 'no-store' } });
}
