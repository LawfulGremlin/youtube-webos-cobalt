# v1.1.5

This release fixes installation of the native IPK on webOS 5.5.

## Fixed

- IPK member archives now use the build timestamp instead of the Unix epoch.
  webOS 5.5 rejects the prior epoch-0 timestamps as implausibly old before it
  registers the application.
- The existing native-app settings, including `internalInstallationOnly`, remain
  unchanged so that webOS creates the required native jail and persistent Luna
  registration.

The fix was verified on an LG OLED CX running webOS 5.5: normal installation
through `appinstalld`, successful launch, and successful launch after reboot.

Install `youtube.leanback.v4_1.1.5_arm.ipk` directly or use the custom
Homebrew Channel repository listed in the README.
