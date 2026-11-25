'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { restDisplay } from '@/lib/insights';
import { scheduleRestChime } from '@/lib/rest-audio';

export type RestDetails = {
  seconds: number;
  startedAt: number;
  logged?: string;
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
  function chime() {
    cancel();
    prime();
    if (audio.current) {
      try { voices.current = scheduleRestChime(audio.current, 0); } catch { /* Audio is optional. */ }
    }
  }
  return { prime, cancel, schedule, chime };
}

const radius = 90;
const circumference = 2 * Math.PI * radius;
const miniRadius = 19;
const miniCircumference = 2 * Math.PI * miniRadius;
const step = 15;

export function RestTimer({ details, audio, close, onMini }: {
  details: RestDetails; audio: ReturnType<typeof useRestAudio>; close: () => void; onMini?: (mini: boolean) => void;
}) {
  const deadline = useRef(details.startedAt + details.seconds * 1_000);
  const audioRef = useRef(audio);
  const notified = useRef(false);
  const collapseTimer = useRef<number>(undefined);
  const sheet = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; offset: number; handle: boolean } | null>(null);
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline.current - Date.now()) / 1_000)));
  const [total, setTotal] = useState(details.seconds);
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pulse, setPulse] = useState(false);
  audioRef.current = audio;

  function remainingNow() {
    return Math.max(0, Math.ceil((deadline.current - Date.now()) / 1_000));
  }

  function finish() {
    if (notified.current) return;
    notified.current = true;
    const vibrated = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && navigator.vibrate(200) === true;
    if (vibrated) audioRef.current.cancel();
    else audioRef.current.chime();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!vibrated && !reduce) setPulse(true);
    window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(() => {
      setPulse(false);
      setCollapsed(true);
    }, reduce || vibrated ? 0 : 280);
  }

  useEffect(() => { onMini?.(collapsed); }, [collapsed, onMini]);

  useEffect(() => {
    function update() {
      const remaining = remainingNow();
      setSeconds(remaining);
      if (remaining === 0) finish();
    }
    update();
    const tick = window.setInterval(update, 200);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(collapseTimer.current);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  useEffect(() => {
    if (collapsed) return;
    sheet.current?.focus();
  }, [collapsed]);

  function adjust(amount: number) {
    audioRef.current.prime();
    const now = Date.now();
    deadline.current = Math.max(now, deadline.current + amount * 1_000);
    const remaining = remainingNow();
    setTotal((current) => Math.max(current, remaining));
    if (remaining > 0) {
      notified.current = false;
      window.clearTimeout(collapseTimer.current);
      setPulse(false);
      audioRef.current.schedule(remaining);
    } else audioRef.current.cancel();
    setSeconds(remaining);
  }

  function pointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const handle = Boolean(target.closest('.rest-handle'));
    if (target.closest('button') && !handle) return;
    drag.current = { y: event.clientY, offset: 0, handle };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const next = Math.max(0, event.clientY - drag.current.y);
    drag.current.offset = next;
    setOffset(next);
  }

  function pointerUp() {
    const state = drag.current;
    if (state && (state.offset > 72 || (state.handle && state.offset < 8))) setCollapsed(true);
    drag.current = null;
    setOffset(0);
  }

  const fraction = total > 0 ? Math.min(1, seconds / total) : 0;
  const clock = restDisplay(seconds);

  if (collapsed) return <div className="rest-mini" role="region" aria-label="Rest timer, minimised">
    <button type="button" className="rest-mini-open" aria-label="Expand timer" onClick={() => setCollapsed(false)}>
      <span className="rest-mini-ring" aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={miniRadius} />
          <circle cx="22" cy="22" r={miniRadius} strokeDasharray={miniCircumference} strokeDashoffset={miniCircumference * (1 - fraction)} />
        </svg>
      </span>
      <span className="rest-mini-copy">
        <span role="timer" aria-live="off">{clock}</span>
        <span>Rest · tap to expand</span>
      </span>
    </button>
    <button type="button" className="rest-mini-skip" onClick={close}>Skip</button>
  </div>;

  return <section ref={sheet} className="rest-sheet" role="dialog" aria-label="Rest timer" tabIndex={-1}
    data-dragging={offset > 0 || undefined}
    style={offset ? { transform: `translateY(${offset}px)` } : undefined}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setCollapsed(true); } }}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    <Image className="rest-photo" src="/images/workouts/w4-lower-night-water.webp" alt="" fill sizes="480px" />
    <span className="rest-scrim" aria-hidden="true" />
    <div className="rest-body">
      <button type="button" className="rest-handle" aria-label="Minimise timer" onClick={() => setCollapsed(true)}>
        <span aria-hidden="true" />
      </button>
      <div className="rest-title">
        <span>Rest.</span>
        {details.logged && <span>{details.logged}</span>}
      </div>
      <div className="rest-stage">
        <button type="button" aria-label="Subtract 15 seconds" onClick={() => adjust(-step)}>−15</button>
        <div className="rest-ring" data-pulse={pulse || undefined}>
          <svg aria-hidden="true" viewBox="0 0 196 196">
            <circle cx="98" cy="98" r={radius} />
            <circle cx="98" cy="98" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} />
          </svg>
          <div className="rest-face">
            <span role="timer" aria-live="off">{clock}</span>
            <span>of {restDisplay(total)}</span>
          </div>
        </div>
        <button type="button" aria-label="Add 15 seconds" onClick={() => adjust(step)}>+15</button>
      </div>
      <div className="rest-footer">
        {details.upcoming && <div className="rest-next">
          <div>
            <span>Up next · {details.upcoming}</span>
            {details.next && <strong>{details.next}</strong>}
          </div>
          {details.last && <span className="rest-last">Last {details.last}</span>}
        </div>}
        <button type="button" className="rest-skip" onClick={close}>Skip rest</button>
      </div>
    </div>
  </section>;
}
