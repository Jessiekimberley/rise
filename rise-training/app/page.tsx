import { TrainingApp } from '@/components/training-app';
import { ownerId } from '@/lib/access';
import { temporarySchedule, todayKey } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { trainingLogView } from '@/lib/storage';
import programme from '../design-handover/programme.json';

export default async function Home() {
  const store = productionStore();
  const today = todayKey();
  let snapshot = await store.load(ownerId);
  if (today >= '2026-11-25' && today <= '2026-11-29' &&
    Object.keys(temporarySchedule).some((date) => snapshot.data.scheduledDays?.[date] === undefined)) {
    snapshot = await store.mutate(ownerId, { type: 'saveSchedule', days: temporarySchedule }).catch(() => snapshot);
  }
  const configuredDoc = process.env.GOOGLE_DOC_ID
    ? { documentId: process.env.GOOGLE_DOC_ID, tabId: process.env.GOOGLE_DOC_TAB_ID || 't.0' }
    : undefined;
  return <TrainingApp initial={trainingLogView(snapshot, true)} today={today} configuredDoc={configuredDoc}
    docsReady={Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)}
    firstName={programme.client.name.split(' ')[0]} />;
}
