import { createPrivateKey, createSign } from 'node:crypto';
import { paragraphText, readWeeks, type DocContent, type DocTarget } from './coach-doc';

const issuer = 'https://oauth2.googleapis.com/token';
const docsScope = 'https://www.googleapis.com/auth/documents';

type DocumentTab = { tabProperties?: { tabId?: string }; documentTab?: { body?: { content?: DocContent[] } }; childTabs?: DocumentTab[] };
type GoogleDoc = { revisionId?: string; tabs?: DocumentTab[] };

export type DocsConfig = DocTarget & { clientEmail: string; privateKey: string };

export function docsConfiguration(target?: DocTarget): DocsConfig | undefined {
  const documentId = target?.documentId ?? process.env.GOOGLE_DOC_ID;
  const serialized = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!documentId || !serialized) return;
  const account = JSON.parse(serialized);
  if (account.type !== 'service_account' || typeof account.client_email !== 'string' || typeof account.private_key !== 'string') {
    throw new Error('Google Docs service account configuration is invalid.');
  }
  return { documentId, tabId: target?.tabId ?? (process.env.GOOGLE_DOC_TAB_ID || 't.0'), clientEmail: account.client_email, privateKey: account.private_key };
}

function b64(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function serviceToken(config: DocsConfig, send: typeof fetch) {
  const timestamp = Math.floor(Date.now() / 1000);
  const assertion = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: config.clientEmail, scope: docsScope, aud: issuer, iat: timestamp, exp: timestamp + 300 })}`;
  const signature = createSign('RSA-SHA256').update(assertion).sign(createPrivateKey(config.privateKey), 'base64url');
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${assertion}.${signature}` });
  const response = await send(issuer, { method: 'POST', body: form, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== 'string') throw new Error('Google could not authorise the Doc connection.');
  return result.access_token as string;
}

function findTab(tabs: DocumentTab[], tabId: string): DocumentTab | undefined {
  for (const tab of tabs) {
    if (tab.tabProperties?.tabId === tabId) return tab;
    const child = findTab(tab.childTabs ?? [], tabId);
    if (child) return child;
  }
}

async function readDocument(base: string, headers: HeadersInit, send: typeof fetch) {
  const read = await send(`${base}?includeTabsContent=true&suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS`, { headers, cache: 'no-store' });
  if (!read.ok) throw new Error([403, 404].includes(read.status) ? 'Google could not open the shared Doc. Confirm the app has edit access to that file.' : 'Google could not read the shared Doc. Try again.');
  return read.json() as Promise<GoogleDoc>;
}

export async function refreshProgramme(config: DocsConfig, defaultWeek: number, send = fetch) {
  const token = await serviceToken(config, send);
  const doc = await readDocument(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(config.documentId)}`, { Authorization: `Bearer ${token}` }, send);
  const target = findTab(doc.tabs ?? [], config.tabId)?.documentTab?.body;
  if (!target) throw new Error('The coaching tab could not be found in the shared Doc.');
  return readWeeks(target.content ?? [], defaultWeek, new Date().toISOString());
}

export async function verifyCheckInTarget(config: DocsConfig, send = fetch) {
  const token = await serviceToken(config, send);
  const doc = await readDocument(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(config.documentId)}`, { Authorization: `Bearer ${token}` }, send);
  if (!doc.revisionId || !findTab(doc.tabs ?? [], config.tabId)?.documentTab?.body) throw new Error('The app needs edit access to the selected Google Doc tab.');
}

export async function appendCheckIn(config: DocsConfig, title: string, body: string, send = fetch) {
  const token = await serviceToken(config, send);
  const base = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(config.documentId)}`;
  const clean = body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000c-\u001f\ue000-\uf8ff]/g, '').trim();
  if (!clean) throw new Error('Enter a check-in before saving to Google Docs.');
  const entry = `${title}\n\n${clean}`;
  const headers = { Authorization: `Bearer ${token}` };

  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await readDocument(base, headers, send);
    const target = findTab(doc.tabs ?? [], config.tabId)?.documentTab?.body;
    if (!target) throw new Error('The coaching tab could not be found in the shared Doc.');
    const text = (target.content ?? []).map(paragraphText).join('');
    if (`\n${text}\n`.includes(`\n${entry}\n`)) return { duplicate: true };
    if (!doc.revisionId) throw new Error('Google did not grant the app edit access to this Doc.');
    const write = await send(`${base}:batchUpdate`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({
        writeControl: { requiredRevisionId: doc.revisionId },
        requests: [{ insertText: { endOfSegmentLocation: { tabId: config.tabId }, text: `\n\n${entry}` } }],
      }),
    });
    if (write.ok) return { duplicate: false };
    if (write.status !== 400 && write.status !== 409) throw new Error('Google did not confirm the write. Retry to check whether it was saved.');
  }
  throw new Error('The shared Doc changed during the save. Try again.');
}
