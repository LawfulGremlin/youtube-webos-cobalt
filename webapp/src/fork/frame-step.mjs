// Fork-owned frame stepping math, ported from LawfulGremlin/youtube-webos
// src/fork-extensions/frame-step.js. Pure helpers here so
// `node webapp/src/fork/test.mjs` covers them; the actions register with
// the shortcut registry in index.js (defaults: red = back, blue = forward).

export const FRAME_DURATION_SEC = 1 / 30;

// Clamp one frame short of the end: Cobalt restarts a video seeked to its
// end (same failure mode as the sponsorblock outro clamp in FORK.md).
export function stepTarget(currentTime, duration, frames) {
  const target = currentTime + frames * FRAME_DURATION_SEC;
  const ceiling =
    typeof duration === 'number' && isFinite(duration) && duration > 0
      ? duration - FRAME_DURATION_SEC
      : Infinity;
  return Math.max(0, Math.min(ceiling, target));
}
