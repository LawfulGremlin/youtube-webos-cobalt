#!/bin/bash
# Control a rooted TV over ssh + luna: the tool set of
# https://github.com/anurmatov/webos-mcp without its SSAP pairing prompt.
# Each command calls the luna service the TV's own SSAP gateway maps that
# ssap:// method to (the map is /usr/palm/services/com.webos.service.secondscreen
# .gateway/interfaces/*.interface on the TV), with the gateway's own payloads.
# Verified live on lg75 (webOS 6.5) 2026-09-01: every read command, plus
# volume, mute and play. Commands marked (*) share the same path but were not
# fired at a TV someone was watching — unverified.
#
# Usage: tools/tv-ctl.sh <device-name> <command> [args]
#   info                 model / serial            (ssap://system/getSystemInfo)
#   sw                   firmware + region         (update/getCurrentSWInformation)
#   power                Active|ScreenOff|Standby  (tvpower/power/getPowerState)
#   app                  foreground app id
#   apps                 installed apps: id  title
#   launch <app-id>      launch or focus an app (*)
#   close <app-id>       close an app (*)
#   open <url>           open a URL in the TV browser (*)
#   volume [0-100]       get / set volume
#   mute on|off
#   output [name]        get / set sound output: tv_speaker, external_optical, ... (*)
#   play|pause|stop|rewind|ff   media keys (play verified)
#   inputs               external inputs (HDMI_1, ...)
#   input <id>           switch to an external input (*)
#   channel [n|up|down]  current channel / tune (*)
#   program              current channel's programme info (*)
#   text <string>        type into the focused text field (*)
#   backspace [n]        delete n characters (*)
#   enter                confirm the focused text field (*)
#   toast <message>      on-screen toast (*)
#   screen on|off        panel off/on, TV keeps running (*)
#   off                  power the TV off — the remote's power key (*)
#   luna <service/method> [json]   any other luna call, pretty-printed
# Remote buttons: tools/tv-key.sh. Screenshots: tools/tv-screenshot.sh.

set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/tv-lib.sh"

usage() { sed -n '/^# Usage/,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
DEVICE="${1:-}"; CMD="${2:-}"
[ -z "$DEVICE" ] || [ -z "$CMD" ] && usage
shift 2

# j key=string key:=json-literal ...  ->  one JSON object
j() {
  python3 -c '
import json, sys
d = {}
for a in sys.argv[1:]:
    k, _, v = a.partition("=")
    d[k[:-1]] = json.loads(v) if k.endswith(":") else v
print(json.dumps(d))' "$@"
}
num() { [[ "$1" =~ ^[0-9]+$ ]] || { echo "$CMD: expected a number, got '$1'" >&2; exit 1; }; }
call() { tv_luna "$DEVICE" "$@"; }
AA=com.webos.service.apiadapter
NI=com.webos.service.networkinput

case "$CMD" in
  info)    call $AA/system/getSystemInfo ;;
  sw)      call com.webos.service.update/getCurrentSWInformation ;;
  power)   call com.webos.service.tvpower/power/getPowerState ;;
  app)     call com.webos.applicationManager/getForegroundAppInfo ;;
  apps)    call com.webos.applicationManager/listLaunchPoints | python3 -c '
import json, sys
for lp in json.load(sys.stdin)["launchPoints"]: print(lp["id"], " ", lp["title"])' ;;
  launch)  call $AA/system_launcher/launch "$(j "id=${1:-}")" ;;
  close)   call $AA/system_launcher/close "$(j "id=${1:-}")" ;;
  open)    call $AA/system_launcher/open "$(j "target=${1:-}")" ;;
  volume)  if [ -n "${1:-}" ]; then num "$1"; call com.webos.service.audio/master/setVolume "$(j "volume:=$1")"
           else call com.webos.service.audio/master/getVolume; fi ;;
  mute)    case "${1:-}" in on) call $AA/audio/setMute '{"mute":true}' ;;
                             off) call $AA/audio/setMute '{"mute":false}' ;;
                             *) usage ;; esac ;;
  output)  if [ -n "${1:-}" ]; then call $AA/audio/changeSoundOutput "$(j "output=$1")"
           else call $AA/audio/getSoundOutput; fi ;;
  play|pause|stop|rewind) call $NI/controls/$CMD ;;
  ff)      call $NI/controls/fastForward ;;
  inputs)  call $AA/tv/getExternalInputList ;;
  input)   call $AA/tv/switchInput "$(j "inputId=${1:-}")" ;;
  channel) case "${1:-}" in
             up)   call $NI/controls/channelUp ;;
             down) call $NI/controls/channelDown ;;
             '')   call $AA/tv/getCurrentChannel ;;
             *)    num "$1"; call $AA/tv/openChannel "$(j "channelNumber=$1")" ;;
           esac ;;
  program) call $AA/tv/getChannelProgramInfo ;;
  text)    call com.webos.service.ime/insertText "$(j "text=$*" "replace:=0")" ;;
  backspace) num "${1:-1}"; call com.webos.service.ime/deleteCharacters "$(j "count:=${1:-1}")" ;;
  enter)   call com.webos.service.ime/sendEnterKey ;;
  toast)   call $AA/system_notifications/createToast "$(j "message=$*")" ;;
  screen)  case "${1:-}" in on)  call com.webos.service.tvpower/power/turnOnScreen ;;
                             off) call com.webos.service.tvpower/power/turnOffScreen ;;
                             *) usage ;; esac ;;
  off)     call $NI/controls/power ;;
  luna)    [ -n "${1:-}" ] || usage; call "$@" ;;
  *)       usage ;;
esac
