import type { UserPreference } from "./types.js";

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    sharedAudioContext ??= new AudioContext();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export async function playUiSound(
  preferences: Pick<UserPreference, "soundEnabled"> | null | undefined,
  variant: "focus" | "close" | "archive" | "restore" = "focus"
): Promise<void> {
  if (!preferences?.soundEnabled) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  const profile = {
    focus: { start: 660, end: 860, duration: 0.09, gain: 0.028, type: "sine" },
    close: { start: 280, end: 180, duration: 0.1, gain: 0.03, type: "triangle" },
    archive: { start: 520, end: 690, duration: 0.12, gain: 0.03, type: "sine" },
    restore: { start: 440, end: 740, duration: 0.11, gain: 0.03, type: "sine" }
  }[variant];

  oscillator.type = profile.type as OscillatorType;
  oscillator.frequency.setValueAtTime(profile.start, now);
  oscillator.frequency.exponentialRampToValueAtTime(profile.end, now + profile.duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(profile.gain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
  oscillator.start(now);
  oscillator.stop(now + profile.duration);
}
