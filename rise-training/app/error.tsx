'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="entry"><div className="wordmark">rise<span>.</span></div><h1>Your log is unavailable</h1><p>Check your connection and try again.</p><button className="primary" onClick={reset}>Try again</button></main>;
}
