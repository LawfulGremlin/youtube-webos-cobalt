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

_Updated 2026-09-03._

| | |
|---|---|
| Upstream line we merge | `upstream/main` (their 1.x line) |
| Last upstream commit merged | `479203b` (2026-08-29), the tip of their main after v1.2.2 and PR #64 |
| Merged in | `5bdac4d` (2026-09-03) |
| Upstream since then | nothing on main; v2.0.0-beta (2026-08-30) stays on a side branch |
| Our latest release | v1.2.1 (2026-09-02); the merged tree is not released yet |
| Shipping base | official YouTube 1.1.7 IPK (Starboard 12 starter) + Cobalt 23.lts.6-12 built from source with upstream's early-preload hook; `cobalt-23.lts.6.patch` is upstream's current one minus the VP9 hunk |
| Fork edits inside upstream files | 46 hunks in 9 files, each marked `fork:` (`git grep -c 'fork:' -- ':!webapp/src/fork' ':!tools'`) |

Version numbers are ours, not upstream's. Our v1.2.1 and their v1.2.1 are unrelated releases
that share a number. See [Tag hygiene](#tag-hygiene).

## Waiting for a decision

Nothing at the moment. The 2026-09-03 sync assessed everything up to `479203b`.

## Decisions

Newest first.

| Upstream change | Verdict | Why | Revisit when |
|---|---|---|---|
| Settings menu scrolling and remote navigation, PR #51 (inner-panel scrolling, held-key debounce, native spatial-navigation detection, rounded corners, `ui.css` title band) | **Deferred** | Both sides fix the same two bugs (double step, more rows than fit). Ours is hardware-verified on both TVs; theirs was written against Cobalt but is untested here. `ui.js` and `ui.css` stayed ours in the 2026-09-03 merge; the only upstream hunk taken in `ui.js` is the Shorts toggle row. | Early September 2026, A/B on lg48 with the throwaway-IPK procedure. |
| Configurable startup page, PR #50 (v1.2.2) | **Taken, rendered by our menu row** | `utils.js` launch hook, the `startupPage` config key and its strings taken as-is. Upstream's `choiceTools` control is not taken (deleted): the option is one of the fork's cycler rows in `fork/index.js`, so it behaves like the rows around it. | Never. |
| Early preload bundle, PR #64 (`adblock-preload.js`, webpack entry, `web_module.cc` hook in the patch) | **Taken** | Runs the Shorts response filter before YouTube's first parse. Needs the runtime hook, so Cobalt 23.lts.6-12 gold and qa were rebuilt 2026-09-03. The fork's JSON.parse chain also runs the same filter, under the same guard flag, on a runtime without the hook. | Never. |
| Shorts toggle and browse-response filter, PRs #48, #52, #62, #63 | **Taken, replaced ours** | Broader than the fork's predicates (sidebar entry, several renderer keys) and has node tests. The fork's Remove Shorts predicates, row and `forkRemoveShorts` key were deleted; a dated migration in `fork/index.js` carries the old setting into `enableShorts`. | Delete the migration block after 2026-11-01. |
| Sponsored QR popup blocker, PR #49 (v1.2.2) | **Taken, replaced ours** | Own toggle, tests and translated labels. The fork's shopping predicates, its CSS fallback and the diagnostic hook were deleted. Their predicate keys on the timely-action type; ours keyed on the nested renderer name. Not yet seen against a live shopping card. | A shopping card shows up on hardware: add the nested-renderer predicate to upstream's module with a `fork:` marker. |
| Node tests and the CI test step (`npm test`, `webapp/test/`) | **Taken** | Step added to the fork-owned `ci.yml`. | Never. |
| Makefile: `$(CURRENT_DIR)` docker mount, `$$aresCmd` fix (v1.2.2) | **Taken** | Their mount fix is make-native and replaces our `$$PWD` marker; the `$$aresCmd` fix converged with ours. Our `&&` chaining in `ares-package` and the `COBALT_DEBUG` forwarding stay. | Never. |
| Language strings, `checkboxTools.setCallback`, config defaults (v1.2.2) | **Taken** | Additive. | Never. |
| Release IPK build workflow, `build-release-ipks.yml` (v1.2.2) | **Rejected** | Our `release.yml` builds against our checked-in binaries. Deleted in the merge; delete again on every sync. | Never. |
| VP9 test-base bump (`51d897f`) and Shorts recycled-node resync (`4e79719`) (v1.2.2) | **Rejected** | `vp9-4k-test.yml` stays deleted; the DOM blocker the resync patched is gone upstream too. | Never. |
| Starterless 2.0 line (`starterless-cobalt-playback`, v2.0.0-beta, 2026-08-30) | **Watching** | Self-built Cobalt starter with SDL2 and Starfish decoding. Replaces the stock `youtube.leanback.v4` app instead of installing beside it. Tested by upstream on one webOS 6.5 TV; their #68 reports it as the only build that starts on a k7lp/webOS 6.5 set. | Our TVs (webOS 2021) stop launching the 1.x line, or YouTube drops Cobalt 23.lts. |
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
Stance as of 2026-09-03: none of them has been seen on our TVs, so no action; revisit any of
them when upstream merges a fix.

| Issue | Why it matters here |
|---|---|
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
