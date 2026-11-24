import { NextResponse } from 'next/server';
import { accessCookie, accessMaxAge, isSameOrigin, unlock } from '@/lib/access';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.code === 'string' && body.code.length <= 256 ? unlock(body.code) : null;
  if (!token) return NextResponse.json({ error: 'This private link is invalid. Open the original link.' }, { status: 401 });
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(accessCookie, token, {
    httpOnly: true, secure: request.headers.get('origin')?.startsWith('https:') === true, sameSite: 'strict', path: '/', maxAge: accessMaxAge,
  });
  return response;
}
