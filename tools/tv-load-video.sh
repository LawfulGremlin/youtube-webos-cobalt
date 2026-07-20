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

ok=no
for i in $(seq 1 25); do
  ok=$(tv_cdp_eval "$IP" "location.hash.indexOf('v=$VIDEO_ID') > -1 && document.querySelector('video') ? 'yes' : 'no'")
  [ "$ok" = "yes" ] && break
  sleep 1
done
if [ "$ok" != "yes" ]; then
  echo "FAILED: watch page for $VIDEO_ID never appeared (stuck on: $(tv_cdp_eval "$IP" "location.hash.slice(0,50)"))" >&2
  exit 1
fi

sleep 2
if [ "$PAUSE_FLAG" = "--paused" ]; then
  tv_cdp_eval "$IP" "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.pause();} 'done'" >/dev/null
else
  tv_cdp_eval "$IP" "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.play();} 'done'" >/dev/null
fi

# fork: `paused:false` alone does not mean media is actually playing — seen
# live: a stalled video (readyState stuck at 0, currentTime frozen at 0) still
# reports paused:false right after play() is called, because that flag flips
# at the JS level independent of whether any frame data ever arrives. Two
# samples a few seconds apart catch what one snapshot can't: readyState below
# HAVE_CURRENT_DATA (2) means no real frame has loaded regardless of position
# reported, and when playing, currentTime must have actually *advanced*
# between samples — not just be nonzero once.
SNAPSHOT='JSON.stringify({videoID:(location.hash.match(/[?&]v=([^&#]+)/)||[])[1]||"", t:document.querySelector("video")?.currentTime||0, paused:!!document.querySelector("video")?.paused, hasVideo:!!document.querySelector("video"), readyState:document.querySelector("video")?.readyState||0})'
sleep 2
SAMPLE1=$(tv_cdp_eval "$IP" "$SNAPSHOT")
sleep 3
SAMPLE2=$(tv_cdp_eval "$IP" "$SNAPSHOT")
echo "$SAMPLE1"
echo "$SAMPLE2"

# Exit 0 only if the requested video is actually loaded, with real media data,
# at roughly the requested position, and genuinely playing/paused — not just
# because the script reached the end without an error.
python3 - "$SAMPLE1" "$SAMPLE2" "$VIDEO_ID" "$POS" "$PAUSE_FLAG" <<'EOF'
import sys, json
s1 = json.loads(sys.argv[1])
s2 = json.loads(sys.argv[2])
video_id = sys.argv[3]
pos = float(sys.argv[4])
want_paused = sys.argv[5] == '--paused'

problems = []
if not s1.get('hasVideo'):
    problems.append('no video element')
if s1.get('videoID') != video_id:
    problems.append('wrong video: %r' % s1.get('videoID'))
if abs(s1.get('t', 0) - pos) > 20:
    problems.append('position off: %ss vs requested %ss' % (s1.get('t'), pos))
if s1.get('readyState', 0) < 2 or s2.get('readyState', 0) < 2:
    problems.append(
        'media not actually loaded (readyState %s -> %s, need >=2/HAVE_CURRENT_DATA)'
        % (s1.get('readyState'), s2.get('readyState'))
    )
if want_paused:
    if not s2.get('paused'):
        problems.append('should be paused but is playing')
    elif abs(s2.get('t', 0) - s1.get('t', 0)) > 1.5:
        problems.append('paused but position drifted (%.1fs -> %.1fs)' % (s1.get('t', 0), s2.get('t', 0)))
else:
    if s2.get('paused'):
        problems.append('not playing (paused)')
    else:
        advanced = s2.get('t', 0) - s1.get('t', 0)
        if advanced < 1.0:
            problems.append(
                'stalled: only %.2fs of video time passed during ~3s of real time despite paused=false'
                % advanced
            )

if problems:
    print('FAILED: ' + '; '.join(problems), file=sys.stderr)
    sys.exit(1)
print('loaded OK')
EOF
