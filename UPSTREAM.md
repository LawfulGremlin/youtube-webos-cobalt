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
| Last upstream commit merged | `6217ffa` (2026-08-09), between their v1.2.1 and v1.2.2 |
| Merged in | `c5393ab` (2026-08-15) |
| Upstream since then | v1.2.2 (2026-08-27) plus about 90 commits on main; v2.0.0-beta (2026-08-30) on a side branch |
| Our latest release | v1.2.1 (2026-09-02) |
| Shipping base | official YouTube 1.1.7 IPK (Starboard 12 starter) + Cobalt 23.lts.6-12 built from source; `cobalt-23.lts.6.patch` held at upstream `37a27f1` |
| Fork edits inside upstream files | 47 hunks in 8 files, each marked `fork:` (`git grep -c 'fork:' -- ':!webapp/src/fork' ':!tools'`) |

Version numbers are ours, not upstream's. Our v1.2.1 and their v1.2.1 are unrelated releases
that share a number. See [Tag hygiene](#tag-hygiene).

## Waiting for a decision

Upstream changes since `6217ffa` that have not been assessed. Each needs a verdict in the next
sync; move the row into the Decisions table once it has one.

| Upstream change | Landed | Notes for the decision |
|---|---|---|
| Shorts toggle (their PR #48) | v1.2.2 | Overlaps our **Remove Shorts** toggle. Standing rule: when upstream ships its own version of a fork feature, delete ours in the same sync. |
| Shorts blocker rewrite: filters TV browse responses instead of the DOM, drops the old observer (PRs #52, #62, #63) | after v1.2.2 | Same overlap. Their new approach is closer to our JSON.parse chain than their old DOM hider was. |
| Sponsored QR-code popup blocker (PR #49) | v1.2.2 | New feature, no overlap. Cobalt-gap grep needed. |
| Configurable startup page (PR #50) | v1.2.2 | New feature, no overlap. |
| Configuration menu scrolling and navigation fixes (PR #51) | after v1.2.2 | Touches `ui.js`, which carries 7 of our `fork:` hunks. Hunk-by-hunk. |
| Early preload bundle: runs the YTAF preload before the initial document load (PR #64) | after v1.2.2 | New bundle in the build. Highest Cobalt risk in the batch; check how it is injected. |
| Automated release IPK builds (`build-release-ipks.yml`, the `ci:` commits) | v1.2.2 | Our `release.yml` already builds releases. This new workflow file is what broke the old sync workflow's push. |
| v1.2.2 as VP9 test base (`51d897f`) | v1.2.2 | We deleted `vp9-4k-test.yml` on 2026-08-15. Likely stays out. |
| Shorts recycled-node resync (`4e79719`) | v1.2.2 | Part of the DOM blocker upstream has since removed itself. |

## Decisions

Newest first.

| Upstream change | Verdict | Why | Revisit when |
|---|---|---|---|
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
| Menu focus fix in `ui.js` (July 2026) | **Kept ours, then converged** | Theirs double-stepped on a real remote (lg48). In v1.1.6 upstream adopted the same `currentFocusIndex` approach. No longer a divergence. | Closed. |
| SponsorBlock marker rewrite and `sponsorblock-categories.js` (July 2026) | **Kept ours** | A/B on lg48: their `findProgressBarParts()` requires an `idomkey="segment"` element the TV client never renders, so markers never appear. The categories module is dead without their `sponsorblock.js`. | Upstream drops the segment-element requirement. |
| json-stringify-hook, text-data-guard, visual-debug, language files, compatibility-test build (July 2026) | **Taken** | Additive, no overlap with fork features. | Never. |

Features from the sibling WebView fork (youtube-webos) are a separate question, covered by the
feature policy in FORK.md.

## Sync history

Newest first. One entry per merge; the merge commit has the details.

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
