'use client';

import { useEffect, useState } from 'react';

export function PrivateEntry({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState('Open your private link to access your training log.');
  useEffect(() => {
    if (!configured) return;
    let pending = false;
    async function openPrivateLink() {
      const code = new URLSearchParams(window.location.hash.slice(1)).get('access');
      if (!code || pending) return;
      pending = true;
      setStatus('Opening your training log…');
      try {
        const response = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        if (!response.ok) throw new Error('The private link could not be opened.');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        window.location.reload();
      } catch {
        setStatus('This private link could not be opened. Reopen the full link to try again.');
        pending = false;
      }
    }
    window.addEventListener('hashchange', openPrivateLink);
    void openPrivateLink();
    return () => window.removeEventListener('hashchange', openPrivateLink);
  }, [configured]);

  return <main className="entry">
    <div className="wordmark">rise<span>.</span></div>
    <h1>Rise Training</h1>
    <p role="status">{configured ? status : 'Private access setup is pending.'}</p>
  </main>;
}
