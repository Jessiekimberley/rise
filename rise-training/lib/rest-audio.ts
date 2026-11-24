export function scheduleRestChime(context: AudioContext, seconds: number) {
  return [660, 880].map((frequency, index) => {
    const voice = context.createOscillator();
    const gain = context.createGain();
    const time = context.currentTime + seconds + index * .23;
    voice.frequency.value = frequency;
    gain.gain.setValueAtTime(.001, time);
    gain.gain.exponentialRampToValueAtTime(.22, time + .03);
    gain.gain.exponentialRampToValueAtTime(.001, time + .19);
    voice.connect(gain).connect(context.destination);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); };
    voice.start(time);
    voice.stop(time + .2);
    return voice;
  });
}
