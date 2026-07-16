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
  `sponsorblock.js` that stops outro skips from looping the video (the one
  deliberate upstream-file edit, marked with a `fork:` comment).
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

## Homebrew repository

Add this URL to webOS Homebrew / Device Manager as a custom repository:

    https://raw.githubusercontent.com/LawfulGremlin/youtube-webos-cobalt/main/repo.json
