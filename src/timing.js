export const AUTO_LOAD_REMAINING = 15;
export const FREEZE_REMAINING = 10;
export const FADE_REMAINING = 5;

export function remainingSeconds(duration, currentTime) {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0, duration - currentTime);
}

export function secondsUntilAutoLoad(duration, currentTime) {
  const remaining = remainingSeconds(duration, currentTime);
  return remaining === null ? null : Math.max(0, remaining - AUTO_LOAD_REMAINING);
}

export function fadeDuration(outgoingRemaining, incomingDuration) {
  return Math.max(0.25, Math.min(FADE_REMAINING, outgoingRemaining, incomingDuration / 2));
}

export function equalPowerGains(progress) {
  const p = Math.max(0, Math.min(1, progress));
  return [Math.cos(p * Math.PI / 2), Math.sin(p * Math.PI / 2)];
}
