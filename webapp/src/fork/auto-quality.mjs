// Start each video at its top quality while the viewer's setting stays auto.
//
// On lg75 (2026-09-24) YouTube's server picked AV1 at 1080p on auto, although
// the player's own target was 2160p and VP9 got 2160p. Auto keeps the level
// that is playing when it is selected and remains free to step down, so the
// top level is selected once and auto handed straight back: playback starts
// at 2160p without being pinned there.
export function liftAutoQuality(player, schedule = setTimeout) {
  if (player.getPreferredQuality() !== 'auto') return false;
  const top = (player.getAvailableQualityLevels() || [])[0];
  if (!top || top === 'auto' || player.getPlaybackQuality() === top) {
    return false;
  }
  player.setPlaybackQualityRange(top, top);
  let tries = 40; // hand back after the switch, or after 10 s regardless
  const handBack = () => {
    // The viewer chose another quality in the meantime: leave it alone.
    if (player.getPreferredQuality() !== top) return;
    if (player.getPlaybackQuality() === top || --tries <= 0) {
      player.setPlaybackQualityRange('auto', 'auto');
    } else {
      schedule(handBack, 250);
    }
  };
  schedule(handBack, 250);
  return true;
}
