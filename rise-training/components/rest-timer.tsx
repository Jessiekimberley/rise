'use client';

import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { restDisplay } from '@/lib/insights';
import { scheduleRestChime } from '@/lib/rest-audio';

export type RestDetails = {
  seconds: number;
  startedAt: number;
  title: string;
  upcoming?: string;
  next?: string;
  last?: string;
};

export function useRestAudio() {
  const audio = useRef<AudioContext | null>(null);
  const voices = useRef<OscillatorNode[]>([]);
  function cancel() {
    for (const voice of voices.current) {
      try { voice.stop(); } catch { /* The tone has ended. */ }
    }
    voices.current = [];
  }
  useEffect(() => cancel, []);
  function prime() {
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state !== 'running') void audio.current.resume().catch(() => {});
    } catch { /* The visual countdown is available independently. */ }
  }
  function schedule(seconds: number) {
    cancel();
    if (audio.current && seconds > 0) {
      try { voices.current = scheduleRestChime(audio.current, seconds); } catch { /* Audio is optional. */ }
    }
  }
  return { prime, cancel, schedule };
}

const radius = 124;
const circumference = 2 * Math.PI * radius;
const step = 15;

export function RestTimer({ details, audio, close }: { details: RestDetails; audio: ReturnType<typeof useRestAudio>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const deadline = useRef(details.startedAt + details.seconds * 1_000);
  const [seconds, setSeconds] = useState(details.seconds);
  const [total, setTotal] = useState(details.seconds);
  const notified = useRef(false);

  function update() {
    const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1_000));
    setSeconds(remaining);
    if (remaining === 0 && !notified.current) {
      notified.current = true;
      navigator.vibrate?.(200);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const tick = window.setInterval(update, 180);
    return () => {
      window.clearInterval(tick);
      element?.close();
    };
  }, []);

  function adjust(amount: number) {
    audio.prime();
    const now = Date.now();
    deadline.current = Math.max(now, deadline.current) + amount * 1_000;
    const remaining = Math.max(0, Math.ceil((deadline.current - now) / 1_000));
    setTotal((current) => Math.max(current, remaining));
    if (remaining > 0) {
      notified.current = false;
      audio.schedule(remaining);
    } else audio.cancel();
    setSeconds(remaining);
  }

  const fraction = total > 0 ? Math.min(1, seconds / total) : 0;

  return <dialog ref={dialog} className="rest-screen" aria-labelledby="rest-heading"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <img className="rest-photo" src="/images/days/night.webp" alt="" />
    <span className="rest-scrim" aria-hidden="true" />
    <div className="rest-body">
      <div className="rest-toolbar">
        <button type="button" className="rest-back" aria-label="Back to sets" onClick={close}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span>{details.title}</span>
        <span aria-hidden="true" />
      </div>
      <h2 id="rest-heading">Rest.</h2>
      <div className="rest-stage">
        <div className="rest-ring">
          <svg aria-hidden="true" viewBox="0 0 272 272">
            <circle cx="136" cy="136" r={radius} />
            <circle cx="136" cy="136" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} />
          </svg>
          <div className="rest-face">
            <span role="timer" aria-live="off">{restDisplay(seconds)}</span>
            <span>of {restDisplay(details.seconds)}</span>
          </div>
        </div>
      </div>
      <div className="rest-nudges">
        <button type="button" onClick={() => adjust(-step)} disabled={seconds === 0}>−15 s</button>
        <button type="button" onClick={() => adjust(step)}>+15 s</button>
      </div>
      <div className="rest-footer">
        {details.upcoming && <div className="rest-next">
          <div>
            <span>Up next · {details.upcoming}</span>
            {details.next && <strong>{details.next}</strong>}
          </div>
          {details.last && <span className="rest-last">Last {details.last}</span>}
        </div>}
        {seconds === 0 && <p className="rest-complete" role="status">Rest complete</p>}
        <button type="button" className="rest-skip" onClick={close}>{seconds === 0 ? 'Continue' : 'Skip rest'}</button>
      </div>
    </div>
  </dialog>;
}
