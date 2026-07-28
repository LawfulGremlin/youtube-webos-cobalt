// Fork-owned playback-speed math. Upstream ships its own version of this
// feature in ui.js, hardwired to digits 1 and 3; this fork can't take that
// because digits 0-9 are bindable slots in the shortcut registry. Same rates
// and same stepping behaviour, exposed as registry actions instead, with
// key_1/key_3 as their DEFAULT slots so the out-of-box bindings match
// upstream while staying rebindable.
//
// Pure helper here so `node webapp/src/fork/test.mjs` covers it; the actions
// register in index.js.

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// Steps one position through PLAYBACK_RATES, clamping at both ends (no wrap —
// wrapping from 2x straight to 0.25x on a stray keypress is a nasty surprise).
// An off-list current rate snaps to the nearest listed one first, so a rate
// set by anything other than this function still steps sensibly.
export function nextPlaybackRate(currentRate, direction) {
  const rate = Number(currentRate);
  const from = isFinite(rate) && rate > 0 ? rate : 1;

  let index = 0;
  for (let i = 1; i < PLAYBACK_RATES.length; i++) {
    if (
      Math.abs(PLAYBACK_RATES[i] - from) < Math.abs(PLAYBACK_RATES[index] - from)
    ) {
      index = i;
    }
  }

  const target = index + direction;
  return PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, target))];
}
