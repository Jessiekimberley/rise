'use client';

import { HeadingSentence, PageGradient, PrimaryButton } from '@/components/ui';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <PageGradient><main className="screen screen-loading">
    <HeadingSentence lead="Your log is unavailable." />
    <p role="alert">Check your connection and try again.</p>
    <PrimaryButton onClick={reset}>Try again</PrimaryButton>
  </main></PageGradient>;
}
