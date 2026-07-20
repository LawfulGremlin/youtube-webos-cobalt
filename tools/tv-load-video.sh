#!/bin/bash
# Load a specific YouTube video by ID on a TV's already-running debug app,
# without reinstalling or restarting anything. See FORK.md ("App restarts
# that restore playback") for why this exact sequence is needed: launch
# params/contentTarget/plain hash mutation/resume_time are all ignored on
# this Cobalt build — planting the watch hash and reloading is the one
# thing that routes.
#
# Usage: tools/tv-load-video.sh <device-name> <video-id> [seconds] [--paused]

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

DEVICE="$1"
VIDEO_ID="$2"
POS="${3:-0}"
PAUSE_FLAG="${4:-}"
[ -z "$DEVICE" ] || [ -z "$VIDEO_ID" ] && { echo "usage: $0 <device-name> <video-id> [seconds] [--paused]"; exit 1; }

IP=$(tv_resolve_ip "$DEVICE")
[ -z "$IP" ] && { echo "no device named '$DEVICE' in the ares registry"; exit 1; }

curl -s -m 3 "http://$IP:9222/json" >/dev/null 2>&1 || {
  echo "no CDP on $DEVICE ($IP) — is the debug app running? (release builds have no debugger)"
  exit 1
}

tv_cdp_eval "$IP" "location.href = location.href.split('#')[0] + '#/watch?v=$VIDEO_ID'; location.reload(); 'reloading'" >/dev/null

echo "reloading..."
tv_wait_cdp "$IP" 25 || { echo "CDP didn't come back within 25s"; exit 1; }
sleep 3

# The account picker swallows the route but the planted hash survives it;
# a synthetic Enter dismisses it (picks the default/first account) and the
# router restores the watch page from the surviving hash.
for i in $(seq 1 10); do
  picker=$(tv_cdp_eval "$IP" "(document.body.textContent||'').indexOf('Add a child account') > -1 ? 'yes' : 'no'")
  [ "$picker" != "yes" ] && break
  tv_cdp_eval "$IP" "(function(){function k(t){var e;try{e=new KeyboardEvent(t,{keyCode:13,which:13,key:'Enter',bubbles:true,cancelable:true});}catch(x){e=document.createEvent('Event');e.initEvent(t,true,true);e.keyCode=13;e.which=13;}(document.activeElement||document.body).dispatchEvent(e);document.dispatchEvent(e);}k('keydown');k('keyup');return 'sent';})()" >/dev/null
  sleep 1
done

for i in $(seq 1 25); do
  ok=$(tv_cdp_eval "$IP" "location.hash.indexOf('v=$VIDEO_ID') > -1 && document.querySelector('video') ? 'yes' : 'no'")
  [ "$ok" = "yes" ] && break
  sleep 1
done

sleep 2
if [ "$PAUSE_FLAG" = "--paused" ]; then
  tv_cdp_eval "$IP" "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.pause();} 'done'" >/dev/null
else
  tv_cdp_eval "$IP" "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.play();} 'done'" >/dev/null
fi

sleep 2
tv_cdp_eval "$IP" "JSON.stringify({videoID:(location.hash.match(/[?&]v=([^&#]+)/)||[])[1]||'', t:Math.floor(document.querySelector('video')?.currentTime||0), paused:!!document.querySelector('video')?.paused})"
