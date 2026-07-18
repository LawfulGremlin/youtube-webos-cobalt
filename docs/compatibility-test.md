# Compatibility test build

`make compatibility-test-package` creates a separate test app for older LG
webOS devices. It uses the Cobalt starter from the official 2022 YouTube
package, while keeping the current Cobalt 23 runtime and the injected web app.

The generated package is:

```text
output/com.cobalt.youtube.adfree.compat_1.0.101_arm.ipk
```

It installs as `com.cobalt.youtube.adfree.compat`, so it does not replace the
regular YouTube app or the normal Cobalt AdFree installation.

When reporting a result, include the TV model, webOS version, firmware version,
whether the app reaches the YouTube home screen, and whether video playback
starts. If it crashes, include the time of the crash and any available TV log.

This build is intended for devices on webOS 4 or earlier. It is an experiment
to validate whether the older official Cobalt starter removes the missing
system-library and ABI problems found by the compatibility checker.
