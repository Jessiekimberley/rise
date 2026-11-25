import { ownerId } from '@/lib/access';
import { todayKey } from '@/lib/insights';
import { productionStore } from '@/lib/neon';
import { workoutCsv } from '@/lib/workout-export';

export async function GET() {
  try {
    const { data } = await productionStore().load(ownerId);
    return new Response(workoutCsv(data), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rise-workouts-${todayKey()}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Rise Training export failed', error instanceof Error ? error.name : 'unknown');
    return new Response('Could not download your workout history. Try again.', { status: 503 });
  }
}
