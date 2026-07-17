#!/bin/bash
# Restart the debug app on a TV, restoring the video that was playing.
# See FORK.md ("Debug builds"). Requires the debug build (CDP on :9222).
#
# Usage: tools/tv-app-restart.sh <tv-ip> <ares-device> [ipk-to-install]
#
# Flow: capture playing video+position over CDP -> close -> (install) ->
# launch -> plant the watch hash and reload -> the account picker swallows
# deep routes, so send Enter to pick the default account (the planted hash
# survives the picker and the router restores it afterwards — verified live;
# launch params/contentTarget and plain hash mutation are all ignored by this
# Cobalt build, this is the only working path) -> seek+play to the captured
# position (the router's resume_time param is ignored too, but the video
# element is directly scriptable).

set -e
TV_IP="$1"
DEVICE="$2"
IPK="$3"
HERE="$(dirname "$0")"
[ -z "$TV_IP" ] || [ -z "$DEVICE" ] && { echo "usage: $0 <tv-ip> <ares-device> [ipk]"; exit 1; }

APP_ID=com.cobalt.youtube.adfree.debug

cdp() { python3 "$HERE/cdp-eval.py" "$TV_IP" "$1" 2>/dev/null \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result']['result'].get('value',''))" 2>/dev/null; }

# 1. capture (best effort — app may be dead/unreachable)
STATE=$(cdp "JSON.stringify({v:(location.hash.match(/[?&]v=([^&#]+)/)||[])[1]||'',t:Math.floor(document.querySelector('video')?.currentTime||0),paused:!!document.querySelector('video')?.paused})" || echo '')
VID=$(echo "$STATE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('v',''))" 2>/dev/null || echo '')
POS=$(echo "$STATE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('t',0))" 2>/dev/null || echo 0)
WAS_PAUSED=$(echo "$STATE" | python3 -c "import sys,json;print('yes' if json.load(sys.stdin).get('paused') else 'no')" 2>/dev/null || echo no)
echo "captured: video='${VID:-none}' t=${POS}s paused=$WAS_PAUSED"

# 2. close / install / launch
ares-launch --device "$DEVICE" -c "$APP_ID" 2>/dev/null || true
sleep 2
if [ -n "$IPK" ]; then
  ares-install --device "$DEVICE" "$IPK"
fi
ares-launch --device "$DEVICE" "$APP_ID"

# 3. wait for CDP
for i in $(seq 1 20); do
  curl -s -m 2 "http://$TV_IP:9222/json" >/dev/null 2>&1 && break
  sleep 1
done
echo "CDP up"

[ -z "$VID" ] && { echo "no video to restore — done"; exit 0; }

# 4. plant the watch hash and reload so the router sees it at bootstrap
sleep 3
cdp "location.href = location.href.split('#')[0] + '#/watch?v=$VID'; location.reload(); 'reloading'" >/dev/null
sleep 8
for i in $(seq 1 20); do
  curl -s -m 2 "http://$TV_IP:9222/json" >/dev/null 2>&1 && break
  sleep 1
done

# 5. account picker: Enter selects the default (first) account
for i in $(seq 1 10); do
  PICKER=$(cdp "(document.body.textContent||'').indexOf('Add a child account') > -1 ? 'yes' : 'no'")
  [ "$PICKER" = "yes" ] && break
  [ "$(cdp "location.hash.indexOf('watch') > -1 ? 'watch' : 'other'")" = "watch" ] && break
  sleep 1
done
if [ "$PICKER" = "yes" ]; then
  echo "account picker: sending Enter (default account)"
  cdp "(function(){function k(t){var e;try{e=new KeyboardEvent(t,{keyCode:13,which:13,key:'Enter',bubbles:true,cancelable:true});}catch(x){e=document.createEvent('Event');e.initEvent(t,true,true);e.keyCode=13;e.which=13;}(document.activeElement||document.body).dispatchEvent(e);document.dispatchEvent(e);}k('keydown');k('keyup');return 'sent';})()" >/dev/null
fi

# 6. wait for the watch page + player, then seek (and play, if it was playing)
OK=no
for i in $(seq 1 25); do
  OK=$(cdp "location.hash.indexOf('v=$VID') > -1 && document.querySelector('video') ? 'yes' : 'no'")
  [ "$OK" = "yes" ] && break
  sleep 1
done
if [ "$OK" != "yes" ]; then
  echo "FAILED: watch page for $VID never appeared (stuck on: $(cdp "location.hash.slice(0,50)"))" >&2
  exit 1
fi
sleep 2
if [ "$WAS_PAUSED" = "yes" ]; then
  cdp "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.pause();} 'resumed'" >/dev/null
else
  cdp "var v=document.querySelector('video'); if(v){v.currentTime=$POS; v.play();} 'resumed'" >/dev/null
fi
sleep 3

# 7. verify — exit 0 only if playback actually restored
FINAL=$(cdp "JSON.stringify({restored:(location.hash.match(/[?&]v=([^&#]+)/)||[])[1]||'', t:Math.floor(document.querySelector('video')?.currentTime||0), paused:!!document.querySelector('video')?.paused, hasVideo:!!document.querySelector('video')})")
echo "$FINAL"
echo "$FINAL" | python3 -c "
import sys, json
s = json.load(sys.stdin)
vid, pos, was_paused = '$VID', $POS, '$WAS_PAUSED' == 'yes'
problems = []
if not s.get('hasVideo'): problems.append('no video element')
if s.get('restored') != vid: problems.append('wrong video: %r' % s.get('restored'))
if abs(s.get('t', 0) - pos) > 20: problems.append('position off: %ss vs %ss' % (s.get('t'), pos))
if not was_paused and s.get('paused'): problems.append('not playing')
if was_paused and not s.get('paused'): problems.append('should be paused but is playing')
if problems:
    print('FAILED: ' + '; '.join(problems), file=sys.stderr)
    sys.exit(1)
print('restored OK')
"
