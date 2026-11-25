import { HeadingSentence, PageGradient } from '@/components/ui';

export default function Loading() {
  return <PageGradient><main className="screen screen-loading" aria-busy="true">
    <HeadingSentence lead="Rise Training." />
    <p role="status">Opening your training log…</p>
  </main></PageGradient>;
}
