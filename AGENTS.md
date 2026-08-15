# youtube-webos-cobalt — agent workspace conventions

> **This file is the single source of the project rules. Change them here.** Codex reads it
> natively; `CLAUDE.md` is a two-line file that imports it. Do not reintroduce a second copy —
> a rule that exists twice is a rule that will disagree with itself.

This repo is a **pull-only shadow fork** of `RF1705/youtube-webos-cobalt-adfree`. The full
technical narrative of what diverges and why lives in [FORK.md](FORK.md) — read it before
touching fork features. The rules below are the working routine.

## Shadow-fork ground rules

- **Never interact with upstream**: no pushes, issues, PRs, or discussions on RF1705's repos.
  The local `upstream` remote has its push URL set to `DISABLED` on purpose. Reading upstream
  (code, issues, releases) is fine and expected.
- Fork-owned files are listed in `.gitattributes` with `merge=ours`. Fork features live in
  `webapp/src/fork/` with a single marked import line in upstream code; unavoidable edits to
  upstream files are minimal and marked with a `fork:` comment.
- `gh` silently targets the wrong repo here (an `upstream` remote is configured): **always pass
  `--repo LawfulGremlin/youtube-webos-cobalt` explicitly** on every `gh` call.

## Sync-merge routine (every upstream merge)

1. **Review upstream's issue tracker first.** Look through open and recently closed issues for
   regressions reported against the release being merged, and weigh them in every take/leave
   decision. This has teeth: the 2026-08 sync found upstream's v1.2.x launch-crash wave
   (issues #36/#37/#41) traced to their new starter/base-IPK model — which this fork therefore
   did not adopt.
2. Resolve conflicts **hunk-by-hunk**. Never take a whole shared upstream file as "ours" —
   that silently reverts unrelated upstream fixes in the same file. After any keep-ours,
   diff base→upstream for that file and account for every hunk.
3. Grep the merged upstream files for Cobalt-missing APIs (`.closest(`, `NodeList`
   `forEach`, dynamically injected `<style>`, …— full engine-gap list in FORK.md). Upstream
   develops against real Chromium and keeps reintroducing them; a swallowed exception looks
   exactly like a working feature.
4. **Hardcoded-key principle**: when upstream ships a feature on a hardcoded remote key, adopt
   it as a shortcut-registry action (`webapp/src/fork/index.js`) with upstream's key as the
   default binding — rebindable and clearable — never as upstream's hard listener.
5. Build the bundle and run `node webapp/src/fork/test.mjs` before committing; hardware-verify
   on a real TV before any release (IPKs are ARM-only — the emulator cannot run them).

## Releases

- Releases are manual: `gh workflow run release.yml --repo LawfulGremlin/youtube-webos-cobalt
  -f version=X.Y.Z`. The raw `repo.json` on `main` is the live Homebrew feed — updating it is
  shipping to users.
- **Keep every published release.** Never delete or overwrite an existing GitHub release or its
  assets: the Homebrew feed only ever serves the latest version, so older releases are the
  rollback path when a new one regresses (upstream's own v1.2.x wave left users asking for
  exactly this). Rolling back = installing an older release's IPK by hand, optionally pointing
  `repo.json` back at it.
- Never publish a release that has not been installed and launched on real hardware.
