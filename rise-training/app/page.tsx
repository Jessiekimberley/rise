import { PrivateLink } from '@/components/private-entry';
import { TrainingApp } from '@/components/training-app';
import { hasAccess, ownerId, privateAccessConfigured } from '@/lib/access';
import { temporarySchedule, todayKey } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { trainingLogView } from '@/lib/storage';
import programme from '../design-handover/programme.json';

export default async function Home() {
  const canManageDocs = await hasAccess();
  const store = productionStore();
  const today = todayKey();
  let snapshot = await store.load(ownerId);
  if (today >= '2026-11-25' && today <= '2026-11-29' &&
    Object.keys(temporarySchedule).some((date) => snapshot.data.scheduledDays?.[date] === undefined)) {
    snapshot = await store.mutate(ownerId, { type: 'saveSchedule', days: temporarySchedule }).catch(() => snapshot);
  }
  const configuredDoc = canManageDocs && process.env.GOOGLE_DOC_ID
    ? { documentId: process.env.GOOGLE_DOC_ID, tabId: process.env.GOOGLE_DOC_TAB_ID || 't.0' }
    : undefined;
  const names = programme.client.name.split(' ');
  return <>
    {privateAccessConfigured() && <PrivateLink unlocked={canManageDocs} />}
    <TrainingApp initial={trainingLogView(snapshot, canManageDocs)} today={today} configuredDoc={configuredDoc}
      canManageDocs={canManageDocs} docsReady={canManageDocs && Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)}
      serviceEmail={canManageDocs ? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL : undefined}
      firstName={names[0]} initials={names.map((name) => name[0]).join('')}
      coachText={canManageDocs ? `sms:${programme.coach.phone.replace(/\D/g, '')}` : undefined} />
  </>;
}
