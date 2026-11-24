import { PrivateEntry } from '@/components/private-entry';
import { TrainingApp } from '@/components/training-app';
import { hasAccess, ownerId, privateAccessConfigured } from '@/lib/access';
import { todayKey } from '@/lib/insights';
import { productionStore } from '@/lib/neon';

export default async function Home() {
  if (!await hasAccess()) return <PrivateEntry configured={privateAccessConfigured()} />;
  const snapshot = await productionStore().load(ownerId);
  const configuredDoc = process.env.GOOGLE_DOC_ID ? { documentId: process.env.GOOGLE_DOC_ID, tabId: process.env.GOOGLE_DOC_TAB_ID || 't.0' } : undefined;
  return <TrainingApp initial={snapshot} today={todayKey()} configuredDoc={configuredDoc} docsReady={Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)} serviceEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} />;
}
