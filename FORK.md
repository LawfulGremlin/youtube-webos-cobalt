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
  removal** (adSlotRenderer/reel ads, rides the existing AdBlock toggle), a
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

    All of it verified live via CDP before touching hardware, mostly without
    needing real playback: inject a synthetic `ytlr-progress-bar`/`slider`
    pair, drive `checkForProgressBar()`, then assert on the result (marker
    geometry and category colour; `parentNode === null` after a simulated
    video switch; `display: none` once the bar is removed).
  - `ui.js` — one hardware-confirmed fix stands: `moveFocus()` re-derived
    "current position" from `document.activeElement` every call — on
    hardware, down/up skipped a row every time. Root cause unconfirmed (see
    the `window.navigate` note below), but the fix doesn't need to know:
    `currentFocusIndex` now tracks position ourselves, advanced only by our
    own calls, so it can't inherit an extra step from anything else that
    might also be moving focus for the same keypress.
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
  Skip 15 Frames Forward/Backward. Defaults: red = 1 frame back, blue = 1 frame
  forward; everything else None (unbound keys fall through to the TV app
  untouched). New features should `registerShortcutAction()` in
  `webapp/src/fork/index.js` instead of installing their own key listeners —
  same API as youtube-webos's `fork-extensions/shortcut-registry.js`, so
  actions port across the two forks unchanged.
- Deliberately not ported: 4K/quality forcing (capped by the Cobalt binary + DRM,
  not fixable in JS), auto-login (Cobalt's native account flow already works), UI
  themes/OLED/cosmetic CSS (WebView-specific, poor fit for Cobalt's CSS subset).
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

## Homebrew repository

Add this URL to webOS Homebrew / Device Manager as a custom repository:

    https://raw.githubusercontent.com/LawfulGremlin/youtube-webos-cobalt/main/repo.json
