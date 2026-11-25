'use client';

import { useState } from 'react';
import { BottomSheet, HeadingSentence, Pill, PrimaryButton } from './ui';

export function StepSync({ unlocked, close }: { unlocked: boolean; close: () => void }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function showDetails() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/steps/setup', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.token !== 'string') {
        throw new Error(result.error ?? 'Could not load Shortcut details.');
      }
      setToken(result.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Shortcut details.');
    } finally {
      setLoading(false);
    }
  }

  return <BottomSheet labelId="step-sync-heading" onClose={close}>
    <HeadingSentence id="step-sync-heading" className="heading-small" lead="Apple Health steps." />
    <p className="fine">Your Shortcut sends the date and total steps to the shared Rise log for use in your check-ins.</p>
    {!unlocked ? <p className="fine">To set up your Shortcut, open your original private Rise link in Safari. Then go to Habits → Apple Health.</p>
    : !token ? <Pill disabled={loading} onClick={() => void showDetails()}>
      {loading ? 'Loading…' : 'Show Shortcut details'}
    </Pill> : <>
      <label className="input-group"><span>Shortcut URL</span>
        <input readOnly value={`${window.location.origin}/api/steps`} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <label className="input-group"><span>Authorization header value</span>
        <input readOnly value={`Bearer ${token}`} onFocus={(event) => event.currentTarget.select()} spellCheck={false} autoComplete="off" />
      </label>
      <ol className="step-sync-instructions fine">
        <li>In Shortcuts, add <strong>Find Health Samples</strong>. Set Type to Steps, Start Date to Today and Group By to Day.</li>
        <li>Use <strong>Get Details of Health Samples</strong> to extract the Value, then <strong>Round Number</strong> to Ones. If the search returns no sample, stop the Shortcut. Compare the result with the same day in Health before your first upload.</li>
        <li>Use <strong>Format Date</strong> on Current Date with custom format <code>yyyy-MM-dd</code>. Rise uses Auckland dates.</li>
        <li>In <strong>Get Contents of URL</strong>, paste the Shortcut URL and choose POST. Add the <code>Authorization</code> header and paste its value from above. In the JSON body, add <code>date</code> as Text with the formatted date and <code>steps</code> as Number with the rounded Health value.</li>
        <li>Run the Shortcut and allow it to read Steps if prompted. Return to Habits to check the total. Running it again updates that day’s count.</li>
      </ol>
    </>}
    {error && <p role="alert" className="notice">{error}</p>}
    <PrimaryButton onClick={close}>Done</PrimaryButton>
  </BottomSheet>;
}
