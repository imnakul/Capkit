let audioContext: AudioContext | null = null;

/**
 * A short, soft confirmation tick, synthesised so no audio asset ships.
 * Silent where Web Audio is unavailable or the browser blocks it before a gesture.
 */
export function playSoftClick(): void {
  if (typeof AudioContext === "undefined") return;
  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(980, start);
    oscillator.frequency.exponentialRampToValueAtTime(620, start + 0.05);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.08);
  } catch {
    // Sound is a nicety; a failure must never affect the copy itself.
  }
}
