# v1.2.1

This release adds a remote-control shortcut for toggling subtitles and updates
the local webOS packaging toolchain.

## Added

- Press `0` while a video is playing to activate YouTube's native CC button.
- The shortcut waits briefly for the player controls to initialize when a video
  has just opened.
- Subtitle status messages are available in all eight bundled interface
  languages.

## Changed

- Replaced the deprecated webOS CLI dependency with the maintained
  `@webos-tools/cli` package.

The shortcut delegates subtitle selection to YouTube itself, including its
automatic-caption behavior. It does not select or modify caption tracks
directly.

Thanks to the users in
[issue #31](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/31)
for suggesting and testing the shortcut.

Install `youtube.leanback.v4_1.2.1_arm.ipk` directly or use the custom Homebrew
Channel repository listed in the README.
