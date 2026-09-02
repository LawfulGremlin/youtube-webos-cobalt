# Fork notes

This repository is a shadow fork of
[RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree):
it is not registered as a GitHub fork, but `main` carries upstream's full history and is kept
up to date automatically.

## Rules

- **Pull only.** We fetch and merge from upstream on a schedule. We never push to upstream and
  never open issues, pull requests, or discussions there.
- **Work as patches.** Fork changes live in fork-owned files (listed in `.gitattributes` with
  `merge=ours`) or as additive patches, so upstream syncs merge cleanly. Avoid editing
  upstream-owned files.

## Automation

- `.github/workflows/sync-upstream.yml` — merges upstream `main` on the 1st and 15th of each
  month (or manually via *Run workflow*). Clean merges land on `main` directly; conflicts open
  a pull request in **this** repository for manual resolution.
- `.github/workflows/release.yml` — manual (*Run workflow*, takes a version). Builds the IPK
  from the current source, publishes a GitHub release `v<version>` with the IPK + webosbrew
  manifest, and regenerates `repo.json` on `main`.

## Feature policy

Features are ported **on demand** (what users actually ask for in the wild, e.g.
NicholasBly/youtube-webos#143), not for blanket parity with the WebView-based
youtube-webos forks — Cobalt is a different runtime and upstream here is actively
adding features itself.

- Fork features live in `webapp/src/fork/` (fork-owned, `merge=ours`). The single
  `import './fork/index.js'` line in `adblock-main.js` is the only wiring inside
  upstream files. Pure logic goes in `filters.mjs` with node-runnable tests in
  `test.mjs` (run by `fork-ci.yml`).
- Current fork features: **Remove Shorts** toggle (shelves + tiles), **feed ad item
  removal** (adSlotRenderer/reel ads + sponsored tiles, rides the existing
  AdBlock toggle — via the JSON.parse chain in fork/index.js plus upstream's
  DOM hider. An XHR responseText-shadow layer scoped to
  /youtubei/v1/(browse|search|next|reel) was built on an early live
  measurement that saw /browse carry an ad node over XHR, but a later
  instrumented pass showed the app never calls those endpoints at all
  (0 of 73 XMLHttpRequest.open calls matched — the feed arrives by some
  transport JS-level hooks don't see), so the shadow was removed 2026-08-15
  as measured dead code; the practical ad-block story on the feed is
  upstream's DOM hider), a
  **shortcut-key registry** with **frame stepping** actions (both ported from
  LawfulGremlin/youtube-webos fork-extensions), and an end-of-video clamp in
  `sponsorblock.js` that stops outro skips from looping the video. These are the
  deliberate upstream-file edits, each marked with a `fork:` comment:
  - `sponsorblock.js` — the outro-loop clamp above, plus a rewrite of the
    marker path: **timeline markers never appeared at all**, on any video,
    regardless of whether it had SponsorBlock data. Skips always worked
    (they're purely `segments` + `video.currentTime`, no DOM), which is what
    made this look like a data problem for so long. Four separate causes, each
    found by inspecting the live DOM over CDP — none were guessable from the
    source, and each one hid the next:
    1. **A reference element that no longer exists.** `findProgressBarParts()`
       required an `idomkey="segment"` child of the progress bar, used only to
       copy its className/cssText. YouTube's TV client doesn't render it any
       more (zero matches anywhere, live, during playback), and its absence
       was treated as "no progress bar found" — so `markerStatus` stuck on
       `waiting-for-progress-bar` forever and `drawOverlay()` never ran.
    2. **The anchor was not stable.** With (1) fixed, markers rendered and
       were then *silently deleted*: YouTube's Incremental DOM prunes any
       foreign node inside the player subtree. Probe nodes placed as a sibling
       of `ytlr-progress-bar` (the anchor this code called stable) and one
       level above were both gone within seconds of playback resuming, while
       an identical probe on `<body>` survived. `drawOverlay()` also calls
       `stopMarkerObserver()` on success, so nothing was watching to notice.
       Markers now live on `<body>`, `position: fixed`, driven off the bar's
       viewport rect — and `maintainMarkers()` (on the existing 250ms skip
       poller) re-attaches them if they're removed anyway.
    3. **The wrong element was measured.** `[idomkey="progress-bar"]` is the
       whole 1728x102 control block; the visible track is its
       `[idomkey="slider"]` child (1728x9). Measuring the former drew a
       102px-tall slab over the video instead of a line on the timeline.
    4. **Nothing local says "hidden".** The TV client fades its transport
       controls with `opacity: 0` on an *ancestor* of the bar: with controls
       away, the slider still reports `opacity: 1` and a full-size rect, so
       neither its own opacity nor its geometry reveals anything — only the
       product of the whole chain does (`getEffectiveOpacity()`). Since the
       overlay hangs off `<body>` it inherits none of that, so it has to
       mirror it manually or it sits on screen permanently.

    Two lifecycle bugs in the same path, both only reachable once markers
    actually rendered: `clearOverlay()` removes the container from the DOM
    rather than just nulling the reference (it used to be a bare
    `this.overlay = null` in four places, and since `findExistingOverlay()`
    only matches the *current* videoID, each video change stranded another
    container forever); and `hideOverlay()` covers the bar vanishing outright
    (leaving a video for the browse UI) — `syncOverlayWithSegment()` can't,
    because it early-returns once `progressBar` is null and never reaches its
    own hide path, which left markers painted over whatever was on screen.

    Upstream has no visibility handling of any kind here — it only ever worked
    by sitting inside the player subtree and inheriting the controls' fade,
    which is the same placement that gets pruned. There was nothing to borrow.

    Markers are **translucent** (`MARKER_ALPHA`, currently 0.55) and cover their
    whole segment, played part included. That single choice replaced a pile of
    machinery — clipping to the unplayed span, pre-blending against the track's
    colour, and dodging the playhead knob's rect — all of which were solving the
    wrong problem. The goal is to see how far into a segment you are *without*
    losing what the segment covers, and letting the compositor blend one
    translucent colour over whatever is beneath does that in one step: over the
    opaque played fill it reads as a pale tint (`rgb(110,110,239)` for outro),
    over the track it stays saturated (`rgb(34,34,166)`), and the boundary
    between the two *is* the progress indicator. The knob shows through too.

    Note "behind the bar" is not achievable, and would not have helped anyway:
    - Inside the slider, anything foreign is pruned in under 100ms (measured —
      the fill is re-patched constantly as it advances; the probe was gone
      before the first 100ms sample).
    - Body-level stacking is unsafe (Cobalt composites video by punching
      through the web layer, so content painted below the player risks being
      erased with it) and unverifiable: this engine has no
      `document.elementFromPoint`, and the debug backend implements neither
      `Page.captureScreenshot` nor `DOM.getNodeForLocation`, so **paint order
      cannot be checked from here at all** — prefer approaches not relying on it.
    - The played fill is *opaque* (`rgb(241,241,241)`), so a marker genuinely
      behind it would simply vanish under the fill — the exact complaint that
      the clipped version produced, since clipping reproduced "behind" honestly.

    `layoutMarkers()` re-derives each marker's span from `data-sb-start`/`-end`
    every tick rather than only at draw time, so a reused overlay
    (`findExistingOverlay()`) or a bar that changed width lands correctly
    instead of keeping the geometry it was first built with.

    The settings-menu swatches deliberately keep the *raw* category colours —
    they're a key to which category is which, not a preview of the exact pixels
    on the bar (which depend on what's underneath them).

    All of it verified live via CDP before touching hardware, mostly without
    needing real playback: inject a synthetic `ytlr-progress-bar`/`slider`
    pair, drive `checkForProgressBar()`, then assert on the result (marker
    geometry and category colour; `parentNode === null` after a simulated
    video switch; `display: none` once the bar is removed).
  - `ui.js` — one hardware-confirmed fix stands: `moveFocus()` re-derived
    "current position" from `document.activeElement` every call — on
    hardware, down/up skipped a row every time. `currentFocusIndex` now
    tracks position ourselves, advanced only by our own calls. **Root cause
    confirmed 2026-09-02** when the double step returned on lg48: a
    `focus()` stack trace showed ui.js's handler running twice per keydown —
    once for the real event and once from YouTube's own key normaliser
    (`vXb` in the kabuki bundle), which re-dispatches a copy of every keydown
    onto *its* focused element while our menu holds the focus. The index fix
    alone can't survive that (each call still advances one row), and Cobalt
    has no `isTrusted` to tell the copy apart, so `fork/index.js`
    (`dropRedispatchedMenuKey`) swallows any keydown whose target lies
    outside the menu while the menu has focus: a real press targets the
    focused row, the copy never does. Verified with real presses over
    evdev: one row per press, and the Left/Right cycler rows, which stepped
    twice for the same reason, step once.
  - **Scrolling past one screen: solved via `display:none/''` row
    windowing** (`ROW_WINDOW_SIZE = 8`, `updateRowWindow()`/`getRowWrapper()`
    in `ui.js`). Three earlier mechanisms failed first, each only
    disprovable by a live hardware round-trip before this fork got remote
    debugging working: native `scrollIntoView` (no-op); manual
    `getBoundingClientRect`+`scrollTop` with a pixel-based `maxHeight` (also
    a no-op — live inspection via CDP later showed why: `getComputedStyle`
    reports `maxHeight` correctly, but this engine doesn't actually enforce
    it as a layout constraint — `clientHeight` exceeded the declared
    `maxHeight` when checked); and an earlier attempt at this same
    windowing approach, which locked up the whole menu on hardware once
    navigation crossed row 8. Root cause of *that* lockup, found via live
    CDP debugging: **this engine has no `Element.prototype.closest` at
    all** (confirmed false on every focusable element, not just some) —
    `getRowWrapper()` used `.closest()` and silently returned `null` every
    time, so the visible window could never shift off its initial `[0,7]`,
    and focusing row 8 onward failed forever (not a "regression under
    navigation" — it never worked once past the first screen). Fixed by
    walking `parentElement` manually instead. Verified live via CDP
    (`Runtime.evaluate` over the debug build's websocket — see below)
    through a full 26-row down+up traversal and a mixed navigate/close
    sequence, with 0 focus failures, *before* touching hardware.
  - `fork/index.js` — `navigation-checkbox.js` polyfills a global
    `window.navigate(dir)` for native browser spatial navigation; nothing in
    this codebase calls it, so if it's real, only the platform calls it. This
    was the first (unverified, possibly-no-op) attempt at the row-skip fix
    above — kept only as a secondary mitigation in case it has other native
    side effects, with logging (`[ytaf-fork] wrapped window.navigate...` /
    `suppressed window.navigate...`) to confirm from `logread` whether it
    does anything at all. The `currentFocusIndex` fix in `ui.js` is what
    actually closes the bug, regardless.
- SponsorBlock category rows in the settings menu each carry a colour swatch
  matching the marker drawn on the timeline. `categoryColors` is exported from
  `sponsorblock.js` and read by `ui.js` so there's one source of truth for the
  colours; `checkboxTools.add()` takes an optional trailing `color` argument
  (rows that don't pass one are unchanged). This makes `ui.js` import
  `sponsorblock.js` while `sponsorblock.js` imports `showNotification` from
  `ui.js` — a cycle, but a safe one: `showNotification` is a hoisted function
  declaration and `categoryColors` is only read at menu-build time, never at
  module top level. Confirmed live (all nine swatches render in the right
  colours, `window.sponsorblock` still initialises).
- Shortcut keys: the settings menu has a binding row per bindable remote key —
  red/yellow/blue color buttons (green opens the menu itself) and number keys 0-9.
  Enter/left/right on a row cycles its action: None, Frame Step Forward/Backward,
  Skip 15 Frames Forward/Backward, Playback Speed Up/Down, Subtitles On/Off.
  Defaults are number-pad back/forward pairs: 0 = subtitles, 1/3 = playback
  speed, 4/6 = 15-frame skip, 7/9 = single-frame step; colour buttons and
  everything else None (unbound keys fall through to the TV app untouched).
  New features should `registerShortcutAction()` in `webapp/src/fork/index.js`
  instead of installing their own key listeners — same API as youtube-webos's
  `fork-extensions/shortcut-registry.js`, so actions port across the two forks
  unchanged. Principle: when upstream ships a feature on a hardcoded key (its
  subtitle toggle on digit 0, playback speed on 1/3), we adopt it as a registry
  action defaulting to upstream's key — rebindable and clearable — rather than
  taking the hardcoded listener.
- `ipks-official/2026-08-15-upstream-v1.2.1-sb13.ipk` is upstream's public
  v1.2.1 release asset, archived because it contains everything their private
  images repo gates: the official-1.1.5 app tree with the **Starboard 13**
  starter (verified `sb_api_version:13` in the binary) and their prebuilt
  23.lts.6-13 `libcobalt.so`. Our shipping base stays the SB12 official 1.1.7
  IPK — upstream's v1.2.x launch-crash wave (their issues #36/#37/#41) is tied
  to this SB13 base, so it's insurance and a future Cobalt 24.lts experiment
  base (24.lts needs SB≥13), not a migration.
- Deliberately not ported: 4K/quality forcing (capped by the Cobalt binary + DRM,
  not fixable in JS), auto-login (Cobalt's native account flow already works), UI
  themes/OLED/cosmetic CSS (WebView-specific, poor fit for Cobalt's CSS subset).
- `cobalt-patches/cobalt-23.lts.6.patch` is deliberately held at upstream's
  `37a27f1` state — **without** their later VP9-4K-force addition (`0f9e01a`),
  which upstream itself never shipped (it exists only in their dispatch-only
  test IPK for their issue #42). Shipped by accident in our v1.1.0: it rewrites
  every platform "NotSupported" for clear VP9 into "Probably" on 4K-output
  devices (99999×99999 included), YouTube then attempts formats the hardware
  can't decode, and playback caps at 720p h264 (measured on lg75; rolled back
  same day, fixed in v1.1.1). If upstream graduates the experiment, re-evaluate
  against a real quality-menu check on hardware — never re-adopt on a green
  build alone.
- If upstream ships its own version of a fork feature, delete ours in the same
  sync PR.

**Releases are hardware-verified**: the app is ARM-only — the x86 webOS emulator
cannot run it. Do not run `release.yml` (it updates the public `repo.json`) until
the build has been sideloaded and checked on a real TV
(`ares-setup-device` + `ares-install`).

## Debug builds (remote devtools)

`make package` (used for every release) patches the checked-in official IPK with a
prebuilt Cobalt binary from `cobalt-bin/*.xz` and never touches Cobalt's own source —
so `REMOTE_DEBUG=1` (a fork-added Makefile flag, independent of upstream's
`COBALT_DEBUG`) only adds the `--remote_debugging_port=9222` switch to an existing
binary. Confirmed on hardware: the gold binary doesn't open the port at all — it's
compiled out, not runtime-disabled. A real debug session needs a Cobalt binary built
from source, with **two** settings, both required:

    make cobalt-bin/23.lts.4-12-logging/libcobalt.so BUILD_COBALT_TYPE=qa
    make cobalt-bin/23.lts.4-12-logging.xz    # archives it in the same format as the others

- `COBALT_DEBUG`/the `-logging` suffix (upstream's own flag) is unrelated to the
  debugger — it only enables this fork's `YtafFileLog` custom logging (from
  `cobalt-patches/`). It does **not** enable the debugger.
- `BUILD_COBALT_TYPE=qa` is what actually matters: Chromium's `ENABLE_DEBUGGER`
  code (the whole remote-debug server, gated with `#if defined(ENABLE_DEBUGGER)`
  in `cobalt/browser/application.cc`) is compiled in only for non-`gold` configs
  (`starboard/build/config/BUILD.gn`: `if (!is_gold) { defines += ["ENABLE_DEBUGGER", ...] }`).
  `gold` is the Makefile's default `BUILD_COBALT_TYPE` — building without overriding
  it silently produces a binary that never opens the port, no error either way.

Then `make package ... COBALT_DEBUG=1` (this time meaning the *packaging* step, not
the from-source build above) picks the `-logging` archive via `PACKAGE_COBALT_ARCHIVE`
and:
- forwards `COBALT_DEBUG` through `docker-make.%` into the container's own `make`
  invocation — command-line variables on the outer `make` don't reach a nested one
  automatically, only real env vars via `-e`, so this needed an explicit fix.
- stubs the specific DevTools frontend files (`UNMINIFIABLE_DEVTOOLS_FILES`,
  currently `formatter_worker.js`, `heap_snapshot_worker.js`) that ares-package's
  bundled terser can't parse — these are heavy-analysis worker-thread bundles
  (pretty-printing, heap snapshots) using newer JS syntax than the rest of the
  frontend. There's no flag to disable ares-package's minification (`-c` means
  "check only, don't package" — a red herring) and `-e`/`--app-exclude` doesn't
  skip minification either (it processes every file before filtering), so this is
  the only way found to keep the (real, working — confirmed by reading
  `debug_web_server.cc`: static `/json` discovery file + websocket, not a stub)
  DevTools frontend without ares-package aborting on it. If a fresh debug build
  hits a *new* unparseable file, add it to `UNMINIFIABLE_DEVTOOLS_FILES`.

**Confirmed working end-to-end on hardware**, including the full CDP loop: `/json`
discovery, the bundled DevTools frontend HTML, and a real WebSocket
`Runtime.evaluate` round-trip (`1+1` → `2`, and inspecting the live page's own
`location.href`/`window.sponsorblock`). The debugger's HTTP handler serves plain
files rooted at `content/web/debug_remote/` (`cobalt/debug/remote/debug_web_server.cc`)
rather than a dynamic REST API — `/json` resolves to a static
`debug_remote/json/index.json` listing a `devtoolsFrontendUrl` and
`webSocketDebuggerUrl` pointing at the bundled frontend, not the standard
`chrome://inspect` auto-discovery flow, but a plain WebSocket client connecting
to `ws://<tv-ip>:9222/devtools/page/cobalt` works directly (see
`tools/cdp-eval.py`, checked in specifically so this doesn't need rebuilding
from scratch next time — `tools/cdp-eval.py <tv-ip> '<js expression>'`).

This is how the row-windowing fix above was actually found and verified — live,
before ever touching hardware — rather than by another guess-and-ship round.

`cobalt-patches/cobalt-23.lts.4.patch` had 5 hunks with corrupted `@@` headers (line
counts didn't match the hunk body — hand-edited at some point without recounting,
not anything this session touched) that made `patch` abort partway with "malformed
patch". Fixed by recomputing every header's counts from its actual body; verify with
`patch -p1 --dry-run < cobalt-patches/cobalt-23.lts.4.patch` against a clean clone
before trusting a patch-file edit.

## Engine quirks (Cobalt 23.lts.4)

Found the hard way, each confirmed live over CDP. Check here before assuming a
web API exists:

- **No `Element.prototype.closest`** — walk `parentElement` manually.
- **No `NodeList.forEach`** — index loops only.

  > These first two keep arriving from upstream, which develops against real
  > Chromium. The v1.1.6 sync brought a DOM-level ad-tile hider in
  > `adblock.js` using both; on Cobalt its `closest()` threw on every ad node,
  > so `startOptionalHook`'s try/catch swallowed it and the whole path never
  > ran (`hook-failed enableAdBlock` in the log). Rewritten in place with a
  > `fork:`-marked `closestMatching()` parent walk and index loops. **Check
  > every sync for new `.closest(` / `NodeList.forEach` in upstream files.**
  > `sponsorblock.js` uses the optional-call form `node.closest?.(…)`, which
  > degrades to `undefined` instead of throwing — safe, but it means that
  > branch is permanently dead here.
  >
  > Probed on lg75 while fixing this, so these no longer need re-deriving:
  > `Element.prototype.matches` **is** present (`"function"`), `closest` and
  > `NodeList.prototype.forEach` are both `undefined`, and the two-argument
  > `classList.toggle(name, force)` **works**. End-to-end verified after the
  > fix by injecting a `<ytlr-ad-slot-renderer>` inside a `[role="listitem"]`
  > tile: the observer fired, the parent walk found the tile, and it went
  > `display: none`.
  >
  > The same sync's `adblock.css` hides ad tiles with a `:has()` rule
  > (lines 23-24), which never matches here — see the `:has()` entry below.
  > Left as-is: it's dead but harmless, and the JS path above does the work.
- **No `document.elementFromPoint`**, and the debug backend implements neither
  `Page.captureScreenshot` nor `DOM.getNodeForLocation`, so **paint order and
  anything visual cannot be checked from here** — prefer approaches that don't
  depend on stacking, and expect to need the user's eyes otherwise.
- **Synchronous XHR throws** — use async + `awaitPromise`.
- **`max-height` is reported by `getComputedStyle` but not enforced as a layout
  constraint** (`clientHeight` exceeded it), so it can't be used to clip a list.
- **Dynamically injected `<style>` elements are silently ignored**: `.sheet`
  stays null and the rules never apply — via `textContent`, `innerHTML`, or
  `appendChild(createTextNode())`, and even for a plain class selector on a
  `<div>`. Fork CSS must be a bundled stylesheet (`fork/fork.css`, folded into
  `adblockMain.css` by webpack and loaded via `<link>`). Custom-tag type
  selectors (`ytlr-shopping-timely-action-renderer`) *do* match from bundled CSS.
- **`:has()` is unsupported** — a rule cannot select a parent by its contents.
- **Incremental DOM prunes foreign nodes** inside the player subtree: next to
  `ytlr-progress-bar` within seconds, inside the progress `slider` in under
  100ms. Only `<body>` survives.
- **No `ResizeObserver`, no CSS Anchor Positioning** (`CSS.supports('anchor-name',
  '--foo')` is `false`) — confirmed live when considering whether SponsorBlock's
  marker-position syncing could be made purely static instead of polled. There is
  no way to make an element track another element's on-screen position without
  JS. `MutationObserver` and `IntersectionObserver` *do* work, though — the gap is
  specific, not "no modern observer APIs at all."

## Keyboard support (physical and virtual keyboards)

Since 1.2.0 a USB or Bluetooth keyboard types into the app — search box,
letters, Space, Backspace — and so does a virtual keyboard created on the TV
(webos-webui's uhid/uinput route). Two parts, both fork-owned:

- **The IPK's `switches` file carries `--enable_keyboard`** (Makefile, next to
  `--evergreen_lite`). LG's closed starter binary receives every key the
  compositor forwards, but its evdev→Starboard table (`webOSKey2SbKey`, read
  out by emulating the function on 2026-09-02) maps only 28 remote codes
  unless that switch is set; with it 161 codes map, including all letters.
  No official or upstream IPK ships the switch. Measured on lg48: without it
  a physical keyboard's letters never reach the page, with it they arrive as
  ordinary keydown/keypress events and the remote keeps working. The switch
  also maps codes the app ignored before (KEY_BACK, KEY_MENU, KEY_SEARCH …),
  which is why a real-remote pass is part of verifying any build.
- **A keyboard-layout feature in `webapp/src/fork/keyboard-layout.mjs`.**
  Cobalt derives `event.key` from US virtual-key codes, and YouTube's search
  box types `event.key` for any keydown whose keyCode is a known typing key
  (measured: keyCode 186 with key 'æ' types æ; unknown keyCodes such as 230
  type nothing). So a capture-phase listener on `window` defines `key` on the
  event from a per-layout table before YouTube sees it. The same listener
  repairs YouTube's re-dispatched copies: its key normaliser (`vXb`) re-sends
  a key as a plain Event holding only keyCode plus `he`, the original, whenever
  its focus manager is locked — most of the time while search suggestions
  render — and the search box types letters and digits from keyCode +
  shiftKey/altKey, so a copy without them typed `g` for Shift+G and `2` for
  AltGr+2 on 1–3 keys of every burst (measured on lg75 with the debug build,
  2026-09-02; a physical keyboard goes through the same path).
  `inheritOriginal()` copies the original's modifiers and key onto the copy
  as own enumerable properties (what Closure's for-in event wrapper reads)
  before the layout lookup. The tables in
  `keyboard-layouts.mjs` are GENERATED by `tools/gen-keyboard-layouts.py`
  from xkeyboard-config through libxkbcommon (ctypes, no build deps): per
  layout, the keys that differ from US as `[base, shift, altgr]`, dead keys
  replaced by their standalone accent. Regenerate after editing the layout
  list in the generator; never edit the output by hand.

The layout is decided **once**, on the first launch after the update, from
the country YouTube resolved for the session (`ytcfg` GL, IP-based): DK→dk,
US→us, and the rest per Microsoft's "Default input profiles (input locales)
in Windows" table (2024-08-30), which names the physical layout each country
ships with. Countries whose standard layout is non-Latin (RU, GR, IL, BG, TH,
KR, CN …) and every unlisted country take us. After that only the
"Keyboard layout" row in the settings menu changes it — moving house or
sitting behind a VPN never re-decides. No country at first launch (offline
start) leaves it undecided, behaving as US, and the next launch decides.
Config key: `forkKeyboardLayout` ('' = undecided); it is deliberately kept
out of the `SHORTCUT_DEFAULTS_VERSION` reset. Over the debug build's CDP,
`window.ytafKeyboardLayout()` reads it and `window.ytafKeyboardLayout('dk')`
sets it.

Known limits: the ISO key left of Z (KEY_102ND) is not in the starter's
table, so characters that live only there (Danish `<` `>` `\`) cannot be
typed by position. AltGr arrives as Alt (`altKey`) and selects level 3;
YouTube types such keydowns as-is (verified on lg48: Danish AltGr+2 typed
@). Caps Lock is ignored. Backspace on an empty search box is Back, as with
the remote. Enter is keyCode 13 and activates whatever is focused: on the
search page that is the voice-mic button by default, and LG's "agree to the
voice terms" system popup then holds every key until remote Back dismisses
it (seen on lg48) — submit a search with the on-screen SEARCH key instead.

## Homebrew repository

Add this URL to webOS Homebrew / Device Manager as a custom repository:

    https://raw.githubusercontent.com/LawfulGremlin/youtube-webos-cobalt/main/repo.json

## App restarts that restore playback

`tools/tv-app-restart.sh <device-name> [ipk]` — closes the debug app
(optionally installing a new IPK), relaunches it, and restores the video that
was playing, at the captured position. Used for every dev close/reopen so a
reinstall doesn't cost the viewer their place. Takes an `ares-*` device name
(resolved to an IP via `tools/tv-lib.sh`), not a bare IP.

Two more small tools round out the loop: `tools/tv-status.sh [device...]`
(reachable? CDP up? what's running?) and `tools/tv-deploy.sh debug|release
<device> [version]` (build + install + launch in one step, auto-bumping the
patch version from the highest existing `output/*.ipk` for that variant if
none is given). `tools/tv-load-video.sh <device> <video-id> [secs] [--paused]`
is the hash-plant-and-reload recipe below, standalone, for jumping an
already-running debug app to a specific video without a full reinstall.

The rest of the TV is scriptable the same way. `tools/tv-ctl.sh`,
`tools/tv-key.sh` and `tools/tv-screenshot.sh` cover what LG's SSAP WebSocket
API offers (the tool set of [webos-mcp](https://github.com/anurmatov/webos-mcp))
without the pairing prompt that API needs: the TVs are rooted, and every
`ssap://` method is a luna-service call the TV's own gateway forwards, so the
tools call that luna service directly over `ssh -tt` (`tv_luna` in
`tools/tv-lib.sh`; the ssap→luna map is
`/usr/palm/services/com.webos.service.secondscreen.gateway/interfaces/*.interface`
on the TV). Two things cost real time to learn: `luna-send` prints nothing at
all without a pty, and remote buttons are plain-text frames written to the
TV-local `/tmp/netinput.pointer.sock` that `getPointerInputSocket` creates.

How it has to work on this Cobalt build (each alternative tested live and
ignored): launch params / `contentTarget` deep links do nothing (cold or warm),
plain hash mutation doesn't route, and `resume_time` in the watch hash isn't
honored. What does work: plant `#/watch?v=<id>` and `location.reload()` so the
router sees it at bootstrap; the account picker swallows deep routes, but the
planted hash *survives* it — a synthetic Enter picks the default account (per
user choice: first entry) and the router then restores the watch page. Position
is restored by scripting the video element directly (`currentTime` + `play()`),
which is also why `resume_time` not working doesn't matter.
