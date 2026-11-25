'use client';

import { useEffect, useRef, useState } from 'react';

export function PrivateLink({ unlocked }: { unlocked: boolean }) {
  const [status, setStatus] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    async function openPrivateLink() {
      const hash = window.location.hash;
      const code = new URLSearchParams(hash.slice(1)).get('access');
      if (!code || pending.current) return;
      const clearCode = () => {
        if (window.location.hash === hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      };
      if (unlocked) { clearCode(); return; }
      pending.current = true;
      setStatus('Connecting your coaching Docs…');
      try {
        const response = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        if (!response.ok) throw new Error('The private link could not be opened.');
        clearCode();
        window.location.reload();
      } catch {
        setStatus('Coaching Docs access could not be restored. Reopen the original private link to try again.');
        pending.current = false;
      }
    }
    window.addEventListener('hashchange', openPrivateLink);
    void openPrivateLink();
    return () => window.removeEventListener('hashchange', openPrivateLink);
  }, [unlocked]);

  return status ? <p className="private-link-status" role="status">{status}</p> : null;
}
