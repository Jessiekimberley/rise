import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const accessCookie = 'rise_private_access';
export const accessMaxAge = 180 * 24 * 60 * 60;
export const ownerId = process.env.RISE_DATA_NAMESPACE || 'rise-owner';

function signingKey() {
  const key = process.env.RISE_ACCESS_KEY;
  return key && key.length >= 32 ? key : undefined;
}

function equal(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

const sign = (expiry: string, key: string) => createHmac('sha256', key).update(`rise-session:${expiry}`).digest('base64url');

export const privateAccessConfigured = () => Boolean(signingKey());

export function unlock(code: string) {
  const key = signingKey();
  if (!key || !equal(code, key)) return null;
  const expiry = String(Math.floor(Date.now() / 1000) + accessMaxAge);
  return `${expiry}.${sign(expiry, key)}`;
}

export function isUnlocked(token: string | undefined) {
  const key = signingKey();
  if (!key || !token) return false;
  const [expiry, signature, ...rest] = token.split('.');
  return rest.length === 0 && /^\d{10}$/.test(expiry) && Number(expiry) > Date.now() / 1000 &&
    typeof signature === 'string' && equal(signature, sign(expiry, key));
}

export async function hasAccess() {
  return isUnlocked((await cookies()).get(accessCookie)?.value);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    const destination = new URL(request.url);
    const source = new URL(origin);
    const host = request.headers.get('host') ?? destination.host;
    const scheme = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? destination.protocol.slice(0, -1);
    return source.host === host && source.protocol === `${scheme}:`;
  } catch { return false; }
}
