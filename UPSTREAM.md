# Upstream ledger

Where this fork stands against
[RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree),
and why. This file holds the **decisions**; the detailed notes for each sync live in its merge
commit (`git log --merges --first-parent main`). The routine for doing a sync is in
[AGENTS.md](AGENTS.md); the technical narrative behind the fork features is in
[FORK.md](FORK.md).

**Update this file in the same commit as every sync merge**, and whenever a decision below
changes. A reader should be able to answer "what did we take, what did we leave out, and why"
from this file alone.

Verdicts used below:

| Verdict | Meaning |
|---|---|
| **Taken** | Merged as upstream wrote it (with Cobalt fixes where noted). |
| **Taken as shortcut action** | Upstream bound it to a hardcoded remote key; we ship it as a rebindable action in the shortcut registry, with upstream's key as the default. |
| **Kept ours** | We already had our own version, verified on hardware; upstream's stays out. |
| **Rejected** | Not taken, for the reason given. Every rejection has a revisit trigger. |
| **Watching** | Not on the line we merge, but relevant to us. |

## Where we stand

_Updated 2026-09-24._

| | |
|---|---|
| Upstream line `main` merges | `upstream/archive/legacy-main-2026-09-17`, their 1.x line. Upstream archived it on 2026-09-17 when `upstream/main` became the starterless 2.0 line. **Never merge `upstream/main` into `main`**: it would switch the shipping app to the starterless runtime. |
| Last upstream commit merged into `main` | `479203b` (2026-08-29), the tip of their 1.x main after v1.2.2 and PR #64 |
| Merged in | `5bdac4d` (2026-09-03) |
| Upstream 1.x since then | v1.2.3, v1.2.4 and v1.2.5, plus #85 and #86 untagged (archive tip `45645bc`); see [Waiting for a decision](#waiting-for-a-decision) |
| Our latest release | v1.2.1 (2026-09-02); the merged tree is not released yet |
| Experimental 2.0 branch | `v2`, merges `upstream/main`; at upstream `a765486` since 2026-09-23. See [The 2.0 branch](#the-20-branch-v2) |
| Shipping base | official YouTube 1.1.7 IPK (Starboard 12 starter) + Cobalt 23.lts.6-12 built from source with upstream's early-preload hook; `cobalt-23.lts.6.patch` is upstream's current one minus the VP9 hunk |
| Fork edits inside upstream files | 46 hunks in 9 files on `main`, each marked `fork:` (`git grep -c 'fork:' -- ':!webapp/src/fork' ':!tools' ':!*.md'`) |

Version numbers are ours, not upstream's. Our v1.2.1 and their v1.2.1 are unrelated releases
that share a number. See [Tag hygiene](#tag-hygiene).

## The 2.0 branch (`v2`)

_Started 2026-09-05, re-synced 2026-09-23. Experimental; `main` stays the shipping line._

Upstream's 2.0 is a runtime swap, not an app change: the same web bundle runs in a self-built
Cobalt 23.lts.6 / Starboard 13 executable (SDL2 window and input, Starfish hardware decoding)
instead of LG's proprietary starter. Since 2026-09-17 that line is `upstream/main`. Branch `v2`
is `main` plus merges of it, so every fork feature rides along and `main` merges into `v2` at
each sync.

| | |
|---|---|
| Upstream commit merged | `a765486` (2026-09-22), the tip of `upstream/main`: `v2.0.4-beta` plus the repeated-seek fix. First merge `d00b2db` (2026-09-05), chosen over `v2.0.1-beta` for PR #64 and the webOS 6 app-resume fix `e0ff8e4` (their #74). |
| Conflicts (2026-09-23) | Five. `build-starterless-cobalt-docker.sh`: took theirs (SDL is no longer built there; the preload install and the binary checks came in). `appinfo.json`: kept our id, vendor and title, version 2.0.2. `ui.js` with `checkboxTools.js`, resolved together: took `9f8938c`'s held-OK latch and upstream's one-second `ytafIgnoreClickUntil` click window, which replaces the older `ytafSkipClick` flag the fork still carried from upstream's July code; PR #51's scrolling and held-direction hunks stay out. Part of the latch auto-merged outside the conflict markers, so keeping ours inside the markers alone would have left an undeclared `isActivationKey` that breaks every menu key. `sponsorblock.js`: ours; all nine upstream hunks since `d00b2db` belong to #78 and #85 (see their rows). First merge: `Makefile` and `cobalt-23.lts.6.patch` (their VP9/UHD capability hunk taken on this branch). |
| What the merges took | 2026-09-23, 75 commits. Playback: the shared Starfish A/V backend (`1c39600`), video held at preroll until Pulse audio is ready (PR #76), the repeated-seek retarget (`a765486`). Binary: the early-preload hook is back (`cobalt-23.lts.6-ytaf-preload.patch`, `install-ytaf-cobalt-assets.sh`), and the build and package scripts refuse a binary without it. Web: the preload bundle and the video-fill IIFE, runtime guide-handler discovery with shared config state, Shorts tiles and paginated feeds (`f7d69d2`), the startup page after a preload relaunch (#86), the held-OK latch (`9f8938c`), six node tests. Build: the SDL bundle is a prebuilt input to the Cobalt build; upstream's two CI workflows (`build-starterless-cobalt.yml`, `package-starterless-ipk.yml`, hand-triggered). 2026-09-05, 24 commits: the Starboard webOS port under `cobalt-platform/webos/arm/`, 19 Cobalt patches, the SDL-webOS build with the relaunch `SIGCONT` patch, libvpx and dav1d cross-builds, the packager with the ownership normalizer, PR #69, the app-resume fix, native screen-saver handling, the seek-preroll deadlock fix, PR #75. No new engine gaps in the changed web files. |
| Fork edits on the branch | App id `com.cobalt.youtube.adfree.v2` in appinfo, so it installs beside the 1.x app and never replaces stock YouTube. `package-starterless-cobalt.sh`: `STARTERLESS_APP_ID` and `STARTERLESS_APP_TITLE` package the same build under another id; hardware tests use `com.cobalt.youtube.adfree.debug`, which takes over the 1.x debug app and its signed-in storage. `starfish_av_components.cc`: the shared backend sends `APPID` like the old decoder instead of a literal `youtube.leanback.v4` (SAM exports `APPID`, measured on lg75 2026-09-05). `fork-webos-av1-switch.patch` (was `fork-webos-vp9-only.patch` until 2026-09-24): AV1 advertised as upstream does, unless `/tmp/ytaf-av1.enable` starts with `0`, a per-TV off switch read once per process (see the AV1 row); `/tmp` is cleared on reboot, so the switch lasts until then. `application_sdl.cc`: the remote's PAUSE key maps to `kSbKeyPause` (see its row). Debug package: `main.cc` appends the switches listed in a `switches` file beside the binary (as the 1.x starter did), `STARTERLESS_SWITCHES=starterless-cobalt/debug.switches` packages one that opens devtools on `0.0.0.0:9222`, and such a package keeps `content/web/debug_remote/` for the `/json` discovery `tools/tv-*.sh` probe. `tools/tv-install-keep-login.sh` installs a 1.x or v2 IPK over an app while keeping its login (also the way back to 1.x; see that row); `tools/tv-codec.sh` reports the playing codec and the runtime's 4K codec answers; `tools/tv-screenshot.sh <tv> <out> <size> SOURCE` captures the hardware video plane, which the default DISPLAY capture never shows; `tools/tv-stream-logs.sh` streams the kernel log, the system logs, the runtime log and memory samples off the TV for as long as it runs, so an outage leaves its lead-up behind. `build-dav1d-webos-docker.sh`: containers run as the host user, kept beside upstream's host-side `mkdir`. JSON.parse: upstream's preload turns `JSON.parse` into an accessor that holds one downstream parser, so the fork's own assignment replaced adblock.js's ad filter (node simulation: chain `["fork"]`). The fork filters now run from inside adblock.js's wrapper (`fork/parse-hook.js`, one `fork:` call): chain `["adblock","fork"]`. Dropped on 2026-09-23: our SDL cmake flags and codec build order, which upstream now carries. |
| Deliberately behind upstream | SponsorBlock markers and end skips (#78, #85) and PR #51's menu scrolling, as on `main`; see the Decisions rows. |
| Not yet done | A release workflow: `release.yml` builds `main`; a v2 release would check in its ~15 MB runtime the way the 1.x line does. Casting (`enable_in_app_dial = false`) and DRM stay off in the runtime. **Signed-out playback is impossible**: without Widevine the client can only play the unencrypted formats YouTube serves to signed-in sessions, so v2 needs an account before the first video, and a real in-app sign-in on v2 has never been tried. Fractional playback rate is unfixed upstream (#81 on a C1, #87), and the fork's 1/3 speed keys feed it. |
| Local build | SDK: openlgtv `buildroot-nc4` release `webos-a38c582`, staged in the docker volume `ytaf-webos-linux-sdk` with `bin/wayland-scanner`, `bin/gawk` and `bin/awk` removed. SDL: the prebuilt bundle `workdir/deps/SDL2-2.30.12-webos-abi` (`scripts/build-sdl-webos-docker.sh` if it is missing). Toolchain images, which this host prunes now and then: `docker compose build base`, then `build-base`, then `build-evergreen` in `workdir/cobalt-23.lts.6`, then add cmake, gawk and libwayland-bin on top (upstream's CI recipe). Cobalt tree: `workdir/cobalt-starterless`, a `--shared` clone of `workdir/cobalt-23.lts.6` at `007628df7`. Build: `COBALT_SOURCE_DIR=$PWD/workdir/cobalt-starterless scripts/build-starterless-cobalt-docker.sh`, which builds the web bundle and installs the patches itself; incremental with ccache in minutes. Package: `COBALT_BUILD_DIR=$PWD/workdir/cobalt-starterless/out/webos-arm-sbversion-13_devel scripts/package-starterless-cobalt.sh`. |
| Way back to 1.x debug | `tools/tv-install-keep-login.sh <tv> output/com.cobalt.youtube.adfree.debug_1.2.1_arm.ipk` on both TVs (user, 2026-09-23; lg48 ran debug 0.0.52 before). That IPK is byte-identical to the `v1.2.1-debug` prerelease asset. The script saves the login the installed runtime actually uses (v2: app dir, 1.x: `content/`) into a new timestamped folder under `/media/developer/ytaf-storage-backup/<app-id>-saves/` on every run, never overwriting, and `LOGIN_FILE=<path>` restores a specific save. The login taken over from 1.x is also in `/media/developer/ytaf-storage-backup/debug-1x-2026-09-23/` on each TV. |
| AV1 against VP9, and the auto-quality lift (lg75, 2026-09-24 afternoon) | **Same picture at the same resolution; AV1 needs half the data.** YouTube's own format table for the test video: AV1 2160p (401) 2.10 Mbit/s average (10.18 peak), VP9 2160p (313) 4.20 (14.87), AV1 1080p (399) 0.49, VP9 1080p (248) 0.91. Shared backend, 150 s steady windows (download over eth0 / app CPU as % of one core / app memory / TV MemAvailable): AV1 2160p 2.4-3.0 Mbit/s, 24.5-25.7 %, 202-206 MB, 162 MB; VP9 2160p 6.3 Mbit/s, 30.1 %, 264 MB, 138 MB; AV1 1080p 0.8, 21.4 %, 156 MB, 201 MB; VP9 1080p 1.35, 24.6 %, 188 MB, 149 MB. VP9 2160p's extra ~60 MB matches YouTube's ~120 s read-ahead at twice the bitrate. 0 dropped frames everywhere, media time 1.00x, seek to playing 1.1-2.3 s for all four, temperature followed warm-up (43 to 69 °C) not the codec. Frames at t=300 s captured from the video plane at 3840x2160: AV1 and VP9 2160p practically identical (PSNR 45.8 dB), 1080p of either about 28 % less edge detail. One shared-backend failure: resuming after a seek and a pause gave "cannot plan shared Opus restart: timestamp/pre-roll outside supported range" and a dead player (VP9 process, once; the same sequence on AV1 twice was fine). **Lift (2.0.5):** fresh load on auto at AV1 2160p by 4 s in, setting still auto (`yt-player-quality` quality 0); earlier the same stored state started at 1080p. Held 2160p through a 75 s block of incoming 443 traffic (buffer 85 to 25 s, no stall, refilled within 10 s). A step down could not be forced: the TV's kernel has only the basic iptables matches and a busybox `tc`, and a 80 %-duty block left the throughput estimate unchanged. |
| Hardware, AV1 by default (lg75, 2026-09-24) | **AV1 plays at 2160p on both backends; on auto YouTube picks AV1 at only 1080p.** Debug builds 2.0.3 and 2.0.4 installed over the debug app with `tools/tv-install-keep-login.sh`, login kept each time. No marker on the TV: AV1 answered "probably" at 2160p60; with `/tmp/ytaf-av1.enable` = 0 it answered no and YouTube chose VP9. Four sessions on `8gKJ9mMPuIQ`, each with kernel log, system logs, runtime log and memory streamed off the TV (`tools/tv-stream-logs.sh`) and a 30 s sampler of media time against wall time. **A** (2.0.2, shared backend off, marker 1): old decoder path, `av01.0.12M.08 (401)` 3840x2160 for 30 min, media 1325.98 s over 1325.88 s of wall time, 0 stalls, seek +120 s and a loop back to 5 s; Starfish event 49 is the presented-frame count and rose 23.97/s for a 24 fps video. The 2026-09-06 stall did not reproduce (that build predates PR #76's preroll sync). **C** (2.0.3, default): `selected shared AV1+Opus backend` at 3840x2160 for 30 min continuous plus the interaction tests, 0 stalls; SOURCE captures (`tools/tv-screenshot.sh … SOURCE`) showed changing, non-black frames (RMSE 0.37-0.50 between captures 4 s apart); seek +120 s and -60 s, pause and resume, 2160p to 1080p (`av01.0.08M.08 (399)`) to auto to 2160p, and Home then relaunch (same process, resumed on the watch page) all worked. **D** (2.0.4, shared backend off): old path at 3840x2160 for 88 min clean with five loop-back seeks, then from 11:29:45 media time ran at 0.72x (21.6 s per 30 s) with frames still changing; a seek and a player reload kept 0.72x, a new app process played at 1.00x again. No TV outage and no standby in about 2 h 40 min of AV1 2160p across A, C and D (MemAvailable never below 159 MB, SoC 74 °C at most); the 2026-09-06 and 2026-09-23 outages stay unexplained. **Auto quality:** with AV1 advertised, YouTube's server-side ABR (SABR) picks AV1 1080p (399) although stats for nerds give `1920x1080*2.00` and an optimal 2160p and the bandwidth estimate was about 37 Mbps; with AV1 hidden it picks VP9 2160p (313). Unchanged by an LG identity (`--user_agent_client_hints` in the `switches` file, as lm21a/75NANO756PA and as O20N/OLED48C15LA), by a stored quality of 2160 then auto or no stored quality at all, by `yt-player-av1-pref`, and by a `navigator.mediaCapabilities` shim (Cobalt has none); the player's own AV1 threshold (`pM` in `tv-player-es6.js`) is 8192 on this runtime. The 2026-09-23 "VP9 2160p on auto" was measured with a stored 2160 preference left by the 1.x forced run. Remote keys: PLAY reaches the page as MediaPlayPause (179, a toggle); PAUSE reached nothing until 2.0.4 and now pauses (keyCode 19). Not verified: picture quality and audio by a person, lg48. |
| Hardware, `a765486` merge (lg75, 2026-09-23) | **Plays, signed in, on the shared backend: VP9 and AV1 both at 2160p.** Debug-id build (`6ed8428`) installed over the 1.x debug app with its login (`tools/tv-install-keep-login.sh`). SAM launch: devtools on `10.0.1.99:9222` from the package `switches` file, `APPID` and `HOME` as expected, signed in, preload ran, Shorts filter installed, "Adblock Removed !" logged (upstream's filter survives the JSON.parse accessor). Test video on "auto" (really with a stored 2160 preference left by the 1.x forced run; see the 2026-09-24 row): `vp09.00.51.08 (313) / opus (251)` at 3840x2160 through `selected shared VP9+Opus backend`, media time tracking wall time over 110 s; +120 s seek resumed. With `/tmp/ytaf-av1.enable` = 1: `av01.0.12M.08 (401) / opus (251)` at 3840x2160 through `selected shared AV1+Opus backend`, about 5.5 min stable including a +200 s seek, MemAvailable steady near 175 MB, thermal zone 69-72 °C. So the 2026-09-06 AV1 stall belongs to the old decoder path. Home then relaunch resumed the same process on the watch page. **Broken: `playbackRate` 1.5 froze playback** (0 s of media time in 10 s; back to 1x it recovered), worse than the 1x clock of 2026-09-06, matching their #87. The runtime logs "media timestamp … less than the last one" about 2700 times in 5 min (steps of 3-70 ms). Not verified: picture and audio (nobody at the TV, volume 0), held OK, sessions over 6 min, the login surviving a reboot. `ares-install <ipk>` failed twice with "Unable to exec" after the upload; installing through `appInstallService/dev/install` over root ssh worked, and the keep-login script now does that. |
| 1.x on lg75 for comparison (debug 1.2.1, 2026-09-23) | LG's starter plays AV1 here: on auto quality `av01.0.08M.08 (399) / opus (251)` at 1920x1080 (levels up to hd2160 offered), forced to hd2160 `av01.0.12M.08 (401)` at 3840x2160. Its runtime answers yes to 2160p60 VP9, VP9.2, AV1 and AV1 HDR. **The first forced-2160p run put the whole TV into standby within about 30 s** (back only by Wake-on-LAN, uptime 1 min, power-on reason `wakeOnLan`, no crash record). The same run repeated with kernel log and memory streamed off the TV played 3+ min cleanly with no kernel messages. Cause unknown: that is two outages in four AV1 sessions on lg75 across both runtimes (2026-09-06 v2 old path, 2026-09-23 1.x). |
| Hardware, `d00b2db` build (lg75, 2026-09-05 and the night to 09-06) | **Root causes of the playback failure found; VP9 decodes at 2160p when signed in. Picture, audio and the quality menu are unverified.** Launch, guest UI, keyboard typing (webos-webui) and second launch (freeze, `SIGCONT`, same process) pass. Playback first showed "This video format is not supported" with no player ever created, for our build and for upstream's own 2.0.1-beta binary alike. Measured over devtools (the starterless build binds them to `[::1]:9222`; reach them with `ssh -L '9222:[::1]:9222'`): the capability answers match the 1.x app; the UA and device type did not matter (identical LG identity via `COBALT_TESTING_*` env and `--user_agent_client_hints=device_type=TV`); Cobalt device authentication did not matter (start URL signed with the TV's own key from libdile, scope `lg-2021-lm21a`). **Cause 1: YouTube serves every format Widevine-encrypted to a signed-out client**; the same video reaches the signed-in 1.x app in the clear. Transplanting the signed-in debug app's `.starboard.<origin>.storage` into the v2 app made the player start (a test hack, not a user path). **Cause 2: AV1 through Starfish stalls on this lm21a NanoCell**: `Play()` accepted, no frame ever presented, one Starfish event repeating. With AV1 hidden YouTube picked VP9. What "decodes" means here: the media element reported `videoWidth` 3840x2160, `readyState` 4 and `currentTime` advancing 10 s per 10 s over 90 s; the runtime log shows "first visible frame reached target" and "Video prerolled"; a +120 s seek flushed the pipeline and resumed at the right position; `SetPlayRate(1.5)` was accepted but the media clock advanced at 1x in a 10 s sample. **Not verified:** the picture (the screenshot tool never captures the hardware video plane), audio (the TV was muted for the whole session), the quality menu against a desktop browser (AGENTS.md step 5; only inferred from the 2160p top of the server's format list), stability beyond 90 s, and a SAM-launched signed-in flow without the storage transplant. The TV also went unreachable for 7 minutes once during the AV1 stall with nobody at it; no crash record was left, cause unknown. |

## Waiting for a decision

- **`main`'s 1.x sync from the archive**: v1.2.3 to v1.2.5 and `45645bc` (our issues #3 to #5).
  **On hold (user, 2026-09-23): `main` is not synced until the v2 debug build has been used on
  the TVs for a while.** The notes below are for when it resumes.
  A trial merge conflicts in `vp9-4k-test.yml`, `Makefile`, `cobalt-23.lts.6.patch` (includes
  `e4c1b48`, "Restrict VP9 UHD capability override") and `sponsorblock.js`, and lands upstream's
  starterless workflows cleanly, which need a keep-or-delete call. Worth taking: the #82 IPK
  ownership normalizer (our v1.2.1 IPK ships every entry as 1001:1001 with 0777 directories,
  the mechanism upstream gives for lost settings and sign-in after a reboot, #66/#70), #86, and
  `f7d69d2` by cherry-pick (2.0 only). The newer preload (#72) needs the same JSON.parse fix as
  `v2` (`fork/parse-hook.js`); take that change from `v2` with it.
- **The sync watcher** still trial-merges `upstream/main` into `main`, which since 2026-09-17
  compares the 2.0 line against 1.x (#6 lists 95 2.0 commits), never fetches the archive, and
  cannot see tags merged into `v2`. Re-point it (archive for `main`, `upstream/main` for `v2`), or
  ignore 2.0 tags for `main`.

## Decisions

Newest first.

| Upstream change | Verdict | Why | Revisit when |
|---|---|---|---|
| Remote PAUSE key on the starterless runtime (`application_sdl.cc`) | **Fixed with a `fork:` marker** | The key (`IR_KEY_PAUSE`, xkb 127 = `KEY_PAUSE`, SDL's `SDL_SCANCODE_PAUSE`) reached no case in `SdlKeyToSbKey` and was dropped; only PLAY, sent as the MediaPlayPause toggle, paused. Mapped to `kSbKeyPause`; lg75 2.0.4: keyCode 19 reaches the page and pauses. | Upstream maps it: take theirs and drop ours. |
| Shared Starfish A/V backend (`1c39600`, v2.0.4-beta) | **Taken on `v2`, `fork:` app-id edit** | Default for WebM Opus with H.264, VP9 or AV1 video, one Starfish session as the only clock. The signed-in lg75 VP9 run of 2026-09-06 was Opus (runtime log), so that measurement was on the path this replaces. AAC, DRM and audio-only stay on the old path. Off switch: `/tmp/ytaf-shared-av.enable` containing 0, or `YTAF_SHARED_AV=0`. Upstream lists open risks: sustained play, a missing Unload quarantines the session until restart, a second video player is refused while the lease is held. | Hardware on both TVs; A/B with the off switch if it misbehaves. |
| Preroll sync (PR #76) and repeated-seek retarget (`a765486`) | **Taken on `v2`** | A/V sync fixes for the old path (AAC streams, or the shared backend off). | Never. |
| Early preload on 2.0 (PR #73) and its JSON.parse accessor | **Taken on `v2`, fork filters moved** | The accessor holds one downstream parser; the fork's second assignment knocked adblock.js out of the chain. The fork filters now run from adblock.js's wrapper (`fork/parse-hook.js`). | On hardware: "Adblock Removed !" and "[ytaf-fork] filtered" both appear. |
| Held-OK activation latch (`9f8938c`, v2.0.2-beta) | **Taken on `v2`** | Our `ui.js` had no repeat guard on OK or Space at all, and the SDL input layer never sets `KeyboardEvent.repeat`. Came with upstream's one-second click window in `checkboxTools.js`; upstream's `menu-activation` test passes on our `ui.js`. PR #51's scrolling stays deferred. | Take on `main` with the archive sync. |
| SponsorBlock markers on the current DOM (PR #78) | **Kept ours** | The revisit trigger fired: upstream now falls back from `segment` to `cue-ranges` and `slider`. But it anchors markers inside the track, where FORK.md measured foreign nodes pruned in under 100 ms, and re-attaches them on the next frame, so the likely failure on our DOM is flicker. Upstream verified it only on a C5, by patching the shipped bundle. | lg48 A/B: delete ours if upstream's markers survive a full playback with the controls toggling. |
| SponsorBlock end skips (PR #85) | **Kept ours** | Upstream's version of our 2026-07-16 end clamp (their #79, on a C1). Ours falls back when the duration is unknown; theirs adds a no-re-skip-after-rewind rule. `sponsorblock-skip-target.mjs` and its test are merged but unused. | With the #78 A/B. |
| Startup page after a preload relaunch (PR #86), Shorts tiles and paginated feeds (`f7d69d2`), guide-handler discovery | **Taken on `v2`** | Merged cleanly; tests pass. | Never. |
| AV1 advertised on every webOS set (upstream's capability patch) | **Taken on `v2` with a per-TV off switch** (`fork-webos-av1-switch.patch`: `/tmp/ytaf-av1.enable` = 0 hides AV1 until reboot) | The 2026-09-06 stall on lg75 does not reproduce: on 2026-09-24 AV1 2160p played on the shared backend (30 min) and on the old decoder path (30 min and 88 min), seeks included. **Cost on lg75:** on auto YouTube picks AV1 at 1080p, while with AV1 hidden it picks VP9 at 2160p; the choice is made server-side and nothing tried on the client moved it (see the 2026-09-24 hardware row). A viewer who selects 2160p gets AV1 2160p. Mitigated on `v2` by `fork/auto-quality.mjs` (2.0.5): each watched video starts at its top level and the setting goes straight back to auto; measured on lg75, see the codec-comparison row. | A real bandwidth drop on auto that the lift gets wrong (no step down could be forced on lg75); lg48 measured; an AV1 stall or outage on either TV. |
| Upstream `main` becomes the 2.0 line, 1.x archived (2026-09-17) | **Noted** | `v2` merges `upstream/main`; `main`'s 1.x source is the archive branch. Upstream still ships 2.x only as prereleases, and its own Homebrew feed serves 1.x v1.2.5. | Upstream makes a 2.x its Latest release, or deletes the archive. |
| Settings menu scrolling and remote navigation, PR #51 (inner-panel scrolling, held-key debounce, native spatial-navigation detection, rounded corners, `ui.css` title band) | **Deferred** | Both sides fix the same two bugs (double step, more rows than fit). Ours is hardware-verified on both TVs; theirs was written against Cobalt but is untested here. `ui.js` and `ui.css` stayed ours in the 2026-09-03 merge; the only upstream hunk taken in `ui.js` is the Shorts toggle row. | Early September 2026, A/B on lg48 with the throwaway-IPK procedure. |
| Configurable startup page, PR #50 (v1.2.2) | **Taken, rendered by our menu row** | `utils.js` launch hook, the `startupPage` config key and its strings taken as-is. Upstream's `choiceTools` control is not taken (deleted): the option is one of the fork's cycler rows in `fork/index.js`, so it behaves like the rows around it. Verified on lg75 with upstream's stock 20 s polling budget; note that `tools/tv-ctl.sh close` only backgrounds the app, so only a real process restart (reinstall, or the TV's own kill) shows the setting take effect. | Never. |
| Early preload bundle, PR #64 (`adblock-preload.js`, webpack entry, `web_module.cc` hook in the patch) | **Taken** | Runs the Shorts response filter before YouTube's first parse. Needs the runtime hook, so Cobalt 23.lts.6-12 gold and qa were rebuilt 2026-09-03. The fork's JSON.parse chain also runs the same filter, under the same guard flag, on a runtime without the hook. | Never. |
| Shorts toggle and browse-response filter, PRs #48, #52, #62, #63 | **Taken, replaced ours** | Broader than the fork's predicates (sidebar entry, several renderer keys) and has node tests. The fork's Remove Shorts predicates, row and `forkRemoveShorts` key were deleted; a dated migration in `fork/index.js` carries the old setting into `enableShorts`. | Delete the migration block after 2026-11-01. |
| Sponsored QR popup blocker, PR #49 (v1.2.2) | **Taken, replaced ours** | Own toggle, tests and translated labels. The fork's JSON predicates and diagnostic hook were deleted. Their predicate keys on the timely-action type and has not yet been seen against a live shopping card here, so the fork's hardware-confirmed CSS safety net on `ytlr-shopping-timely-action-renderer` stays (`fork/fork.css`), now gated on upstream's toggle instead of AdBlock. | A shopping card shows up on hardware: check which layer caught it; if the CSS did, add the nested-renderer predicate to upstream's module with a `fork:` marker. |
| Node tests and the CI test step (`npm test`, `webapp/test/`) | **Taken** | Step added to the fork-owned `ci.yml`. | Never. |
| Makefile: `$(CURRENT_DIR)` docker mount, `$$aresCmd` fix (v1.2.2) | **Taken** | Their mount fix is make-native and replaces our `$$PWD` marker; the `$$aresCmd` fix converged with ours. Our `&&` chaining in `ares-package` and the `COBALT_DEBUG` forwarding stay. | Never. |
| Language strings, `checkboxTools.setCallback`, config defaults (v1.2.2) | **Taken** | Additive. | Never. |
| Release IPK build workflow, `build-release-ipks.yml` (v1.2.2) | **Rejected** | Our `release.yml` builds against our checked-in binaries. Deleted in the merge; delete again on every sync. | Never. |
| VP9 test-base bump (`51d897f`) and Shorts recycled-node resync (`4e79719`) (v1.2.2) | **Rejected** | `vp9-4k-test.yml` stays deleted; the DOM blocker the resync patched is gone upstream too. | Never. |
| Starterless 2.0 line (`starterless-cobalt-playback`, v2.0.0-beta, 2026-08-30; `upstream/main` since 2026-09-17) | **Watching** on `main`; **merged on branch `v2`** (2026-09-05, re-synced 2026-09-23) | Self-built Cobalt starter with SDL2 and Starfish decoding. Replaces the stock `youtube.leanback.v4` app instead of installing beside it (the `v2` branch uses its own id). Tested by upstream on one webOS 6.5 TV; their #68 reports it as the only build that starts on a k7lp/webOS 6.5 set. See [The 2.0 branch](#the-20-branch-v2). | `main` adopts it when the `v2` branch passes hardware verification and playback parity with 1.x, or when our TVs stop launching the 1.x line, or YouTube drops Cobalt 23.lts. |
| Makefile `$$` to `$` regressions (v1.2.1) | **Fixed with `fork:` markers** | Broke the docker build (`$PWD`) and skipped the package check (`$aresCmd`). | Upstream fixes them differently: take theirs, drop ours. |
| `vp9-4k-test.yml` (v1.2.1) | **Rejected** | Deleted 2026-08-15. 4K works without the experiment. | Never. |
| Starboard 13 starter as shipping base (v1.2.x) | **Rejected** | Their v1.2.x launch-crash wave (#36, #37, #41) is tied to this base. We ship the SB12 official 1.1.7 IPK. Their SB13 IPK is archived in `ipks-official/` for a future Cobalt 24.lts experiment. | Crash wave resolved, or we need Cobalt 24.lts (needs SB13 or newer). |
| Private images repo split (v1.2.1) | **Rejected** | `RF1705/YouTube-webos-images` is private. Our binaries stay checked in; `ci.yml` became fork-owned because upstream's fails when binaries are tracked. | Upstream makes the images public. |
| Pre-package mtime pipeline: `normalize-package-mtime.py` + `verify-ipk-container.py` (v1.2.1) | **Taken** | Replaced `normalize-ipk-mtime.py`, which we had fixed twice (`d8a9c05`). Our fix deleted as obsolete. Install verified on lg75 2026-08-15. | Never. |
| Subtitle toggle on key 0 (v1.2.1) | **Taken as shortcut action** | First application of the hardcoded-key principle. Confirmed on the lg75 remote. | Never. |
| Cobalt patches for 23.lts.6 and 24.lts.4 (v1.2.1) | **Taken, held at `37a27f1`** | See the VP9 row below. Cobalt 23.lts.6-12 built from this patch and made the default 2026-08-15. | Never. |
| VP9-4K force hunk in `cobalt-23.lts.6.patch` (`0f9e01a`) | **Rejected** | Never shipped by upstream (test IPK only). Shipped by accident in our v1.1.0 and capped playback at 720p on lg75. | Upstream ships it in a release **and** the quality menu on our hardware matches a desktop browser. |
| Auto-login (v1.1.6) | **Taken** | Additive. Hardware-checked 2026-08-15. | Never. |
| Shorts-ad DOM hider in `adblock.js` (v1.1.6) | **Taken, Cobalt-fixed** | Used `.closest()` and `NodeList.forEach`, neither exists on Cobalt. Silently dead until `4a59412`. | Every sync: grep again. |
| `normalize-ipk-mtime.py` (v1.1.6) | **Taken, then replaced** | Broke `make package` on this machine (cross-filesystem replace, deterministic `ar`). Fixed in `d8a9c05`, superseded by upstream's v1.2.1 pipeline. | Never. |
| Green-key debounce (`34623b1`) | **Taken** | Restored 2026-07-28 after the 07-20 merge reverted it by accident. Confirmed on the lg75 remote. | Never. |
| Playback-speed shortcuts on digits 1 and 3 (July 2026) | **Kept ours** | Digits are bindable slots in our shortcut registry. Ours lives in `fork/playback-speed.mjs`, default binding 1/3. | Never (hardcoded-key principle). |
| Menu focus and focus-guard rewrite in `ui.js` (July 2026) | **Kept ours** | Theirs double-stepped on a real remote (lg48). Upstream later adopted our `currentFocusIndex` idea, but its spatial-navigation suspend/restore, focus guard and focus-restore code stayed out, so `ui.js` remains a real divergence (see the PR #51 row). | With the PR #51 A/B. |
| SponsorBlock marker rewrite and `sponsorblock-categories.js` (July 2026) | **Kept ours** | A/B on lg48: their `findProgressBarParts()` requires an `idomkey="segment"` element the TV client never renders, so markers never appear. The categories module is dead without their `sponsorblock.js`. | Upstream drops the segment-element requirement. |
| json-stringify-hook, text-data-guard, visual-debug, language files, compatibility-test build (July 2026) | **Taken** | Additive, no overlap with fork features. | Never. |

Features from the sibling WebView fork (youtube-webos) are a separate question, covered by the
feature policy in FORK.md.

## Sync history

Newest first. One entry per merge; the merge commit has the details.

**2026-09-23, `upstream/main` tip `a765486` into `v2`** (v2.0.2-beta to v2.0.4-beta plus one
commit). Took the shared Starfish A/V backend, the preroll and repeated-seek fixes, the early
preload, and the web changes (#86, `f7d69d2`, `9f8938c`, guide discovery). Kept our SponsorBlock.
Fixed the JSON.parse chain fork-side, added the `APPID` edit and the package id override,
dropped our duplicated SDL flags. Issues reviewed: every upstream issue and PR through #93;
relevant here: #81 and #87 (speed on 2.x), #83 (drift, closed by the shared backend), #2
(installing 2.x over 1.x crash-loops), #74, #68, #71, #92. `main` untouched.

**2026-09-03, upstream v1.2.2 and tip `479203b`** (merge `5bdac4d`). Took the
startup page (as a fork menu row), the early preload bundle with a rebuilt runtime, upstream's
Shorts and sponsored-QR blockers in place of the fork's own, the node tests, the Makefile
fixes and the strings. Deferred PR #51's menu scrolling and navigation as a unit. Rejected the
release-build workflow and the VP9 test files. Issues reviewed: #70, #46, #66, #24, #2, #42,
#68, #45 and the launch-failure cluster; none reproduced on our TVs, no action until upstream
merges fixes.

**2026-08-15, upstream v1.2.0 to v1.2.1 and tip `6217ffa`** (merge `c5393ab`, prepared by
`09b428a` on 08-09). Took the subtitle toggle as a registry action, the pre-package mtime
pipeline, the Cobalt patches, the PJTR and stock-starter machinery, and the webos-tools CLI
migration. Rejected the private-images split and the SB13 base. Same day: Cobalt 23.lts.6-12
built from source and made the default; v1.1.0 released, found capped at 720p, superseded by
v1.1.1 the same evening. Issues reviewed: #36, #37, #41 (launch crashes, confirmed keeping our
base), #42 (4K, moot after the patch revert).

**2026-07-28, upstream v1.1.2 to v1.1.6** (merge `944b747`). Took auto-login, the Shorts-ad
DOM hider, the IPK mtime script, language files. Restored the green-key debounce that the
previous merge had reverted by accident. Playback-speed shortcuts kept out. Lesson recorded in
AGENTS.md: never resolve a shared file by taking it whole as ours.

**2026-07-20, upstream tip `a8d1c0e`** (merge `da4ed5b`). First real merge. Upstream had
rewritten `sponsorblock.js`, `ui.js` and `checkboxTools` to fix bugs we had already fixed
differently; both versions were A/B tested on lg48 and ours kept. Took the additive modules,
five language files, the compatibility-test build and the Cobalt 23.lts.4-12 binary. Our v1.0.3
released the same day.

**2026-07-15, fork set up.** Two clean fast-forwards by the old sync workflow. Our v1.0.1
released 2026-07-18.

## Upstream issues we watch

Read upstream's open issues at every sync. These are the ones with a bearing on this fork.
Stance as of 2026-09-23: none of them has been seen on our TVs, so no action; revisit any of
them when upstream merges a fix.

| Issue | Why it matters here |
|---|---|
| #81 LG C1 on webOS 6.5.3-47 (lg48's firmware): playback above 1x broken on v2.0.2; #87 video freezes on a speed change on 2.0.4 | Our 1/3 speed keys feed it on `v2`. |
| #2 (2026-09-22 comment): installing 2.x over 1.x crash-loops, because existing directories keep their owner | Uninstall before installing `v2` under a 1.x id. |
| #83 A/V drift, closed 2026-09-22 by the shared backend (Opus only) | Watch for drift on AAC streams on `v2`. |
| #70 app directory ships as uid 501:20, so a reboot breaks savegame and the app boot-loops | Check whether our IPK ships the same ownership. Ours is packaged on a GitHub runner. |
| #66 settings not saved when the app closes (v1.2.2) | Possibly the same root cause as #70. |
| #46 playback above 1x drops to 480p (fractional bitrate fails Cobalt's mime parser) | We ship our own playback-speed action. Check whether ours triggers it. |
| #68 launch matrix on k7lp/webOS 6.5: only v2.0.0-beta starts | Pressure signal for the 2.0 **Watching** row. |
| #32, #36, #37, #41, #45 launch failures on 1.2.x (webOS 3.9, 5.5, 26) | Tied to the SB13 base and newer webOS. Informational: our compatibility scope is the two household TVs. |
| #42 4K quality not found | Upstream's VP9 experiment thread. Our stance is the VP9 row above. |
| #54 compressed Cobalt runtime fails without LZ4 content size | Not assessed. About upstream's compressed-runtime option. |

## Hardware verification

One row per release we published. The IPK is ARM-only; nothing ships without this.

| Release | Date | TV | Result |
|---|---|---|---|
| `v2` debug build 2.0.5 (not a release) | 2026-09-24 | lg75 | Auto quality starts at the top level (`fork/auto-quality.mjs`): AV1 2160p on auto from a fresh load, setting stays auto, a 75 s traffic block survived without stall. Codec comparison recorded in the 2.0 table. Left installed, quality auto, TV off. |
| `v2` debug builds 2.0.3 and 2.0.4 (not releases) | 2026-09-24 | lg75 | AV1 advertised by default and playing 2160p on the shared backend and on the old path (sessions of 30, 30 and 88 min, logs streamed), seek, pause/resume, quality changes and Home + relaunch OK, PAUSE key fixed in 2.0.4. On auto YouTube picks AV1 1080p (VP9 2160p with AV1 hidden). The old path slowed to 0.72x after 88 min until the app restarted. No outage. 2.0.4 left installed, quality set back to auto, markers removed. |
| `v2` debug-id build `6ed8428` (not a release) | 2026-09-23 | lg75 | Installed over the 1.x debug app keeping the login; signed in; VP9 2160p on auto and AV1 2160p with the marker, both on the shared backend, seek and relaunch OK; 1.5x freezes playback. Left installed for everyday use. 1.x (debug 1.2.1) measured first: AV1 1080p on auto, AV1 2160p when forced; one TV-wide outage in two forced-2160p runs. |
| `v2` branch with `fork-webos-vp9-only.patch` (not a release) | 2026-09-06 | lg75 | SAM-launched, signed in (storage transplanted from the debug app): AV1 answered "not supported", VP9 chosen, 480p then 3840x2160 both prerolled with a first visible frame per the runtime log. Picture, audio and quality menu unverified. Removed after the test. |
| `v2` branch `4a2f757` (not a release) | 2026-09-05/06 | lg75 | Starterless build: launch, guest UI, keyboard typing and second launch OK. Playback needs a signed-in account (signed-out gets DRM-only formats) and VP9 (AV1 stalls); with both, the media element reports 2160p VP9 advancing and seeking; picture and audio unverified. |
| QR-card CSS fallback restored (`a112f09`, debug build 1.2.2, not released) | 2026-09-03 | lg75 | Fresh install from main. `ytaf-hide-shopping` class set at start; a synthetic `ytlr-shopping-timely-action-renderer` computed `display: none`; toggling the QR row off through its own click listener removed the class and the element rendered (`inline`), toggling it back on hid it again, setting persisted both ways. Preload flag still true. |
| 2026-09-03 sync (merge `5bdac4d`, debug build 1.2.2, not released) | 2026-09-03 | lg75 | Preload ran (`__ytafPreloadExecuted` true) and installed the Shorts filter; a stored Remove Shorts setting migrated to `enableShorts=false`; Home rendered with no Shorts shelf (the sidebar's Shorts entry remains, upstream behaviour); Shorts, QR and startup-page rows present; startup page opens on Subscriptions after a real process restart; test video `8gKJ9mMPuIQ` (offers up to 2160p) settled at 1080p on this build and on v1.2.1-debug at the same playback time, so the ladder is unchanged; stable across five relaunches. |
| v1.2.1-debug (prerelease, not in the feed) | 2026-09-03 | lg75 | Debug variant of the same code, kept as the pre-sync fallback. Installed beside the release app, launched, stable past 60 s, CDP up, UA `Cobalt/23.lts.6 qa Starboard/12`, fork menu row present. |
| v1.2.1 | 2026-09-02 | lg75 | Shift/AltGr and dead-key layouts typed through a virtual keyboard into the release build. Feed verified. |
| v1.2.0 | 2026-09-02 | lg75 | Physical and virtual keyboard input. |
| v1.1.1 | 2026-08-15 | lg75, lg48 | VP9 2160p60 offered, SponsorBlock skip and end clamp, key-0 subtitles. |
| v1.1.0 | 2026-08-15 | lg75 | Launched and played, quality capped at 720p. **Do not install.** Kept published as a record; superseded by v1.1.1. |
| v1.0.3 | 2026-07-20 | lg48 | Release build installed and launched. |
| v1.0.1, v1.0.2 | 2026-07-18 | | Not recorded. |

## How a sync is noticed

`.github/workflows/sync-upstream.yml` polls upstream daily for release tags (`v*`) that are not
yet ancestors of `main`. On the first sighting it opens an issue in this repository listing the
unmerged tags, the commit range, whether a trial merge was clean, and the sync checklist, then
fails the run so the notification is loud. It never pushes anywhere. The merge itself is always
done by hand, following the routine in AGENTS.md, and ends with an update to this file. Close
the issue when the tag is merged, or when the decision is not to merge it (a closed issue is
not reopened for the same tag).

## Tag hygiene

Upstream and this fork both tag releases `vX.Y.Z`, and the names collide. Local clones fetch
upstream's tags under `refs/tags/upstream/` so `v1.2.1` is always ours and `upstream/v1.2.1`
is always theirs:

```
git config remote.upstream.tagopt --no-tags
git config --add remote.upstream.fetch '+refs/tags/*:refs/tags/upstream/*'
```

Never run `git fetch upstream --tags`. The watch workflow uses the same namespace.
