#!/bin/bash
# Report what the running debug app is playing and what the runtime claims to
# decode: YouTube's stats-for-nerds codec line, the video element's decoded
# size, the quality levels offered, and isTypeSupported answers for 2160p60
# VP9, VP9.2 (HDR) and AV1. Load a video first (tools/tv-load-video.sh).
#
# Usage: tools/tv-codec.sh <device-name>

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
[ -z "$DEVICE" ] && { echo "usage: $0 <device-name>"; exit 1; }
IP=$(tv_resolve_ip "$DEVICE")
[ -z "$IP" ] && { echo "no device named '$DEVICE' in the ares registry"; exit 1; }

# Cobalt has no NodeList.forEach and an empty innerText; stick to plain loops.
tv_cdp_eval "$IP" "(function () {
  var out = {};
  var v = document.querySelector('video');
  if (v) out.video = { w: v.videoWidth, h: v.videoHeight, t: Math.round(v.currentTime), paused: v.paused, rate: v.playbackRate };
  var p = document.getElementById('ytlr-player__player-container-player') || document.querySelector('.html5-video-player');
  if (p) {
    try { var s = p.getStatsForNerds && p.getStatsForNerds(); if (s) out.nerds = { codecs: s.codecs, resolution: s.resolution, format: s.video_format || s.optimal_format, color: s.color }; } catch (e) { out.nerdsError = String(e); }
    try { out.quality = p.getPlaybackQuality && p.getPlaybackQuality(); } catch (e) {}
    try { out.levels = p.getAvailableQualityLevels && p.getAvailableQualityLevels(); } catch (e) {}
    if (!out.nerds) { var keys = []; for (var k in p) if (/nerd|stats|videodata|quality/i.test(k)) keys.push(k); out.playerKeys = keys; }
  }
  var types = {
    vp9: 'video/webm; codecs=\"vp09.00.51.08\"; width=3840; height=2160; framerate=60',
    vp9hdr: 'video/webm; codecs=\"vp09.02.51.10.01.09.16.09.00\"; width=3840; height=2160; framerate=60',
    av1: 'video/mp4; codecs=\"av01.0.12M.08\"; width=3840; height=2160; framerate=60',
    av1hdr: 'video/mp4; codecs=\"av01.0.13M.10.0.110.09.16.09.0\"; width=3840; height=2160; framerate=60'
  };
  out.supported = {};
  for (var name in types) { try { out.supported[name] = MediaSource.isTypeSupported(types[name]); } catch (e) { out.supported[name] = String(e); } }
  return JSON.stringify(out);
})()"
