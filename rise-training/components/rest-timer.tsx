'use client';

import { Pause, Play, Timer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { restDisplay } from '@/lib/insights';
import { scheduleRestChime } from '@/lib/rest-audio';
import { BottomSheet, RoundButton } from './ui';

export type RestDetails = {
  seconds: number;
  startedAt: number;
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

const step = 10;

export function RestTimer({ details, audio, close }: { details: RestDetails; audio: ReturnType<typeof useRestAudio>; close: () => void }) {
  const deadline = useRef(details.startedAt + details.seconds * 1_000);
  const held = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(details.seconds);
  const [paused, setPaused] = useState(false);
  const notified = useRef(false);

  function update() {
    if (held.current != null) return;
    const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1_000));
    setSeconds(remaining);
    if (remaining === 0 && !notified.current) {
      notified.current = true;
      navigator.vibrate?.(200);
    }
  }

  useEffect(() => {
    const tick = window.setInterval(update, 180);
    return () => window.clearInterval(tick);
  }, []);

  function adjust(amount: number) {
    audio.prime();
    if (held.current != null) {
      held.current = Math.max(0, held.current + amount);
      setSeconds(held.current);
      return;
    }
    const now = Date.now();
    deadline.current = Math.max(now, deadline.current) + amount * 1_000;
    const remaining = Math.max(0, (deadline.current - now) / 1_000);
    audio.schedule(remaining);
    if (remaining > 0) notified.current = false;
    update();
  }

  function togglePause() {
    audio.prime();
    if (held.current != null) {
      const remaining = held.current;
      held.current = null;
      deadline.current = Date.now() + remaining * 1_000;
      if (remaining > 0) {
        notified.current = false;
        audio.schedule(remaining);
      }
      setPaused(false);
      update();
      return;
    }
    const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1_000));
    held.current = remaining;
    audio.cancel();
    setPaused(true);
    setSeconds(remaining);
  }

  return <BottomSheet className="rest-sheet" labelId="rest-heading" onClose={close}>
    <div className="rest-sheet-head">
      <h2 id="rest-heading">Rest</h2>
      <RoundButton aria-label="Close rest timer" onClick={close}><X size={18} /></RoundButton>
    </div>
    <div className="rest-clock">
      <button type="button" className="rest-nudge" aria-label="Subtract 10 seconds" onClick={() => adjust(-step)} disabled={seconds === 0}>
        <Timer size={16} aria-hidden="true" /><span>−10</span>
      </button>
      <span role="timer" aria-live="off">{restDisplay(seconds)}</span>
      <button type="button" className="rest-nudge" aria-label="Add 10 seconds" onClick={() => adjust(step)}>
        <Timer size={16} aria-hidden="true" /><span>+10</span>
      </button>
    </div>
    {seconds === 0 ? <p className="rest-done" role="status">Rest complete</p> : <button type="button" className="rest-pause" aria-label={paused ? 'Resume rest' : 'Pause rest'} aria-pressed={paused} onClick={togglePause}>
      {paused ? <Play size={26} aria-hidden="true" /> : <Pause size={26} aria-hidden="true" />}
    </button>}
  </BottomSheet>;
}
