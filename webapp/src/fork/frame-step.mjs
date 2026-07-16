// Fork-owned frame stepping, ported from LawfulGremlin/youtube-webos
// src/fork-extensions/frame-step.js. The Cobalt base has no shortcut-key
// registry, so the actions bind directly to the free remote color keys
// (green already opens the settings menu): red = back, blue = forward.
// Pure helpers here so `node webapp/src/fork/test.mjs` covers them;
// the DOM/key wiring lives in index.js.

export const FRAME_DURATION_SEC = 1 / 30;

// Red 403; blue 406 (191 on some firmwares — see the keycode table in ui.js).
const KEY_FRAMES = {
  403: -1,
  406: 1,
  191: 1
};

export function framesForKey(keyCode) {
  return KEY_FRAMES[keyCode] || 0;
}

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
