# v1.1.6

This release fixes the startup regression in v1.1.5.

## Fixed

- macOS AppleDouble metadata is removed from the IPK control and data archives.
  The hidden `._control` entry in v1.1.5 appeared before the real Debian
  `control` file, so some webOS installers parsed binary macOS metadata as the
  package description and left the native app incompletely registered.
- Repacked gzip archives no longer embed a temporary source filename.
- Normalized archive members keep root ownership, current timestamps and no
  extended PAX metadata.

The release package contains the same application payload as v1.1.5 apart from
the package version and archive metadata cleanup.
