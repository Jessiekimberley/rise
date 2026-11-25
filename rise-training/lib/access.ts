export const ownerId = process.env.RISE_DATA_NAMESPACE || 'rise-owner';

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
