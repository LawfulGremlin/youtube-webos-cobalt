# v1.1.0

> **Important app ID change:** v1.0.0 used the separate app ID
> `com.cobalt.youtube.adfree` and could be installed next to the official
> YouTube app. v1.1.0 now uses `youtube.leanback.v4` and replaces the official
> YouTube application. This change restores compatibility with YouTube phone
> pairing. An existing v1.0.0 side-by-side installation is not removed
> automatically and can be uninstalled manually.

## Highlights

- Updated the default runtime to Cobalt `23.lts.4`.
- Added Return YouTube Dislike support.
- Improved SponsorBlock playback handling, colored timeline markers and menu
  controls.
- Added playback-speed shortcuts: press `1` to decrease and `3` to increase the
  speed while a video is playing.
- Improved ad filtering and compatibility with current YouTube TV responses.
- Stabilized remote-control navigation and settings focus.
- Kept verbose Cobalt logging and the visual debug overlay out of normal
  release builds.

## Installation

Install `youtube.leanback.v4_1.1.0_arm.ipk` directly or use
`youtube.leanback.v4.manifest.json` with the webOS Homebrew Channel.

The release package was built without debug logging and tested on an LG webOS
TV. SponsorBlock and Return YouTube Dislike access are enabled in the bundled
Cobalt runtime.
