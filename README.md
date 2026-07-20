> **This is a detached fork** of [RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree) — all credit for the original project goes there. This fork adds hardware-specific fixes and features on top of it, for personal use on webOS 6.5.3.

# YouTube webOS Cobalt

[![CI](https://github.com/LawfulGremlin/youtube-webos-cobalt/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/LawfulGremlin/youtube-webos-cobalt/actions/workflows/ci.yml)
[![Fork CI](https://github.com/LawfulGremlin/youtube-webos-cobalt/actions/workflows/fork-ci.yml/badge.svg?branch=main)](https://github.com/LawfulGremlin/youtube-webos-cobalt/actions/workflows/fork-ci.yml)
[![Latest release](https://img.shields.io/github/v/release/LawfulGremlin/youtube-webos-cobalt?label=latest%20release)](https://github.com/LawfulGremlin/youtube-webos-cobalt/releases/latest)

## Add to webOS Homebrew

1. Open **Homebrew Channel** on your TV.
2. Go to **Settings → Add repository**.
3. Enter this URL:

   ```text
   https://raw.githubusercontent.com/LawfulGremlin/youtube-webos-cobalt/main/repo.json
   ```

4. The app now shows up in Homebrew's app list as installable and
   updatable, pulling directly from this fork's releases.

## What this fork adds

Everything below is hardware-verified — found and confirmed by inspecting a
real TV live over Chrome DevTools Protocol, not assumed from reading the
source. The full technical story for each (root causes, what didn't work
first, exact engine quirks hit along the way) lives in [FORK.md](FORK.md);
this is the summary.

Features:

* **SponsorBlock category color key** in the settings menu — each toggle row
  shows a swatch in the same color as its timeline marker.
* **Shortcut-key registry** with frame-stepping actions (ported from
  [LawfulGremlin/youtube-webos](https://github.com/LawfulGremlin/youtube-webos)'s
  `fork-extensions`), plus upstream's own playback-speed shortcuts.

Fixes:
* **Menu focus that moves one row at a time.** The settings menu used to skip
  a row on every Down/Up press on real hardware (not reproducible via a
  synthetic key event — only a real remote press triggers it).
* **SponsorBlock markers that render on local hardware** Upstream's original marker
  code silently never worked on any video — four separate, stacked DOM/engine
  issues, all fixed here. Markers are translucent and cover the whole
  segment, so the played portion shows through as a lighter tint instead of
  hiding your progress through it.
* **Ad-blocking fixed for the feed**, not just what the page's own
  `JSON.parse` sees. The home/search/Shorts feed and in-video "shopping"
  overlays are filtered at the XHR response layer, which is the only point
  every consumer of that data actually passes through on this platform.

## Requirements
* LG TV with webOS
* Homebrew Channel, Developer Mode or root access

## Installation

Download a release `.ipk` from the
[releases page](https://github.com/LawfulGremlin/youtube-webos-cobalt/releases)

ares-cli
```sh
ares-install com.cobalt.youtube.adfree_*.ipk
```

SSH on rooted/Homebrew webOS
```sh
mkdir -p /media/developer/temp
cd /media/developer/temp
wget https://github.com/LawfulGremlin/youtube-webos-cobalt/releases/download/v<version>/com.cobalt.youtube.adfree_<version>_arm.ipk
luna-send-pub -i 'luna://com.webos.appInstallService/dev/install' '{"id":"com.ares.defaultName","ipkUrl":"/media/developer/temp/com.cobalt.youtube.adfree_<version>_arm.ipk","subscribe":true}'
rm /media/developer/temp/com.cobalt.youtube.adfree_*.ipk
```

## Development
* Linux (Ubuntu)
* Docker (Docker-compose)
* Required tools: sudo apt install jq git sed binutils squashfs-tools rename findutils xz-utils

This fork packages under its own app ID, com.cobalt.youtube.adfree, so it installs alongside the official YouTube app rather than replacing it.

Community-reported device, firmware and feature results are collected in the device compatibility matrix. The matrix also contains the reporting template and unpatched baseline test packages used for compatibility investigations.

### Building the release package

```sh
make package \
  PACKAGE=ipks-official/2023-07-30-youtube.leanback.v4-1.1.7.ipk \
  PACKAGE_NAME=com.cobalt.youtube.adfree \
  PACKAGE_DISPLAY_NAME='YouTube Cobalt AdFree' \
  PROJECT_VERSION=<x.y.z>
```

`PACKAGE` is an official YouTube Leanback IPK to patch (one is checked in
under `ipks-official/`). The output lands in `output/`.

**Docker is used automatically** — `make package` invokes the webapp bundle
step and `ares-package` both through `docker-make.%`, which runs a
containerized `make` inside `node:22` (see `NODE_DOCKER_IMAGE` in the
Makefile). You just need Docker installed and running; there's no separate
manual `docker build`/`docker run` step to remember.

### Building a debug variant (remote DevTools)

This is the workflow used to develop and hardware-verify everything in
[What this fork adds](#what-this-fork-adds) above — every fix in this fork
was found and confirmed this way, live on a real TV, before shipping.

The release binary has its remote-debugging server compiled **out**
entirely (confirmed on hardware — the switch to enable it does nothing on a
`gold` binary). A real debug session needs a Cobalt binary built from source
as a `qa` config instead:

```sh
make cobalt-bin/23.lts.4-12-logging/libcobalt.so BUILD_COBALT_TYPE=qa
make cobalt-bin/23.lts.4-12-logging.xz
```

This only needs to be done once — the result is committed under
`cobalt-bin/*-logging.xz` so it doesn't need rebuilding from scratch. Then
package with it:

```sh
make package \
  PACKAGE=ipks-official/2023-07-30-youtube.leanback.v4-1.1.7.ipk \
  PACKAGE_NAME=com.cobalt.youtube.adfree.debug \
  PACKAGE_DISPLAY_NAME='YouTube Cobalt Debug' \
  PROJECT_VERSION=<x.y.z> \
  COBALT_DEBUG=1
```

`COBALT_DEBUG=1` picks the `-logging` Cobalt archive, forwards through to
the containerized build correctly, and stubs the couple of DevTools frontend
files that ares-package's bundled minifier can't parse. Install this
alongside the release build under its own app ID
(`com.cobalt.youtube.adfree.debug`) — the two coexist fine, and giving the
debug variant a distinct icon (already done here) makes it obvious which one
is running.

Once installed and launched, the app opens a real Chrome DevTools Protocol
endpoint at `http://<tv-ip>:9222`:

```sh
tools/cdp-eval.py <tv-ip> '1 + 1'                       # sanity check
tools/cdp-eval.py <tv-ip> 'window.sponsorblock.markerStatus'
```

This is a plain WebSocket client (`ws://<tv-ip>:9222/devtools/page/cobalt`)
rather than the standard `chrome://inspect` flow, but it gives full
`Runtime.evaluate` access — DOM inspection, live state, injecting synthetic
segments/events to test logic without needing a real annotated video, all
without touching hardware more than once to confirm the final result.

When iterating on a debug build, `tools/tv-app-restart.sh` closes the app,
optionally installs a new IPK, relaunches it, and restores whatever video
was playing (at the same position, same paused state) so a reinstall doesn't
cost you your place:

```sh
tools/tv-app-restart.sh <tv-ip> <ares-device-name> [path/to/new.ipk]
```

### Building a compatibility-test package

A separate build path exists for testing against older webOS releases
without touching the main installation — it reuses the Cobalt starter from
an older official YouTube package while keeping the current Cobalt 23
runtime and web app:

```sh
make compatibility-test-package
```

Installs as `com.cobalt.youtube.adfree.compat`, alongside everything else.
See [docs/compatibility-test.md](docs/compatibility-test.md) for what to
report back if you test one of these.

### Registering a TV with ares-cli

```sh
ares-setup-device -a <device-name> \
  -i "username=root" \
  -i "privatekey=/path/to/id_rsa" \
  -i "passphrase=SSH_KEY_PASSPHRASE" \
  -i "host=<tv-ip>" \
  -i "port=22"
```

See [Development TV setup](#development-tv-setup) below for the Developer
Mode (non-rooted) equivalent.

### Running the fork's own tests

Pure logic in `webapp/src/fork/` (feed filtering, frame-step math, the
shortcut registry) has node-runnable tests, no build step needed:

```sh
node webapp/src/fork/test.mjs
```

Run automatically on push/PR by `fork-ci.yml`, kept separate from upstream's
own `ci.yml` so the two never collide.

### Where things live

* `webapp/src/fork/` — fork-owned feature code (`merge=ours` — upstream
  syncs never touch it). `filters.mjs`/`shortcut-registry.mjs`/`frame-step.mjs`
  are pure logic with tests in `test.mjs`; `index.js` is the only wiring
  point, imported once from upstream's `adblock-main.js`.
* `sponsorblock.js`, `ui.js`, `checkboxTools.js` — upstream files with
  targeted, `fork:`-commented edits (marker rendering, menu focus, category
  swatches). Kept as close to upstream as possible; see FORK.md for why each
  edit exists and what it replaced.
* `tools/cdp-eval.py`, `tools/tv-app-restart.sh` — development tooling
  described above.
* `FORK.md` — the full technical narrative: root causes, dead ends, and the
  Cobalt/webOS engine quirks discovered along the way (missing
  `Element.prototype.closest`, no `NodeList.forEach`, synchronous XHR
  disallowed, dynamically-injected `<style>` elements silently ignored, and
  more). Worth reading before assuming a web API exists on this platform.

## Patch an official YouTube IPK

Clone the repository:

```sh
git clone https://github.com/LawfulGremlin/youtube-webos-cobalt.git
cd youtube-webos-cobalt
```

Patch your official YouTube IPK:

```sh
make package PACKAGE=./your-tv-youtube.ipk PACKAGE_NAME=com.cobalt.youtube.adfree
```

The patched IPK will be created in the `output/` directory. See
[Development](#development) above for the full set of build variants
(release, debug, compatibility-test).

## Standalone Cobalt launcher

The standalone launcher path builds an app that only starts Cobalt with the
YouTube TV URL. It does not copy files from an official YouTube package.

```sh
make standalone-package
```

Default values:

```text
App ID: com.cobalt.youtube.launcher
Name:   YouTube Cobalt
URL:    https://www.youtube.com/tv?launch=menu
Cobalt: Evergreen 7.1.2, arm-softfp, sbversion-18
```

This target needs a free Cobalt runtime directory containing:

```text
cobalt-bin/7.1.2-arm-softfp-sb18/cobalt
cobalt-bin/7.1.2-arm-softfp-sb18/lib/libcobalt.lz4
cobalt-bin/7.1.2-arm-softfp-sb18/content/
```

`libcobalt.lz4` and `content/` can come from the official Cobalt Evergreen
release asset:

```text
cobalt_evergreen_7.1.2_arm-softfp_sbversion-18_release_compressed_20260627021609.crx
```

The release asset does not include the webOS app starter. Provide a
webOS-compatible Cobalt starter from the matching `27.lts.1` source/port and
copy it into the runtime directory as `cobalt`. Cobalt's Evergreen
`loader_app` target may produce a shared object on Evergreen platforms; that is
not by itself the executable webOS `main` file.

The older patch archives usually only contain `libcobalt.so`, because they
reuse the official YouTube app's Cobalt starter. In that case the standalone
target stops with a clear error instead of falling back to official app files.

The app id, title and URL can be changed:

```sh
make standalone-package \
  STANDALONE_APP_ID=com.cobalt.youtube.launcher \
  STANDALONE_DISPLAY_NAME="YouTube Cobalt" \
  STANDALONE_YOUTUBE_URL="https://www.youtube.com/tv?launch=menu"
```

For a compatibility proof of concept that uses the extracted webOS starter with
the matching `23.lts.4-12` runtime:

```sh
make standalone-poc-package
```

This still builds a separate app and does not patch the official YouTube app.
The extracted starter is only a temporary compatibility bridge until a free
webOS Cobalt starter is available.

## Autostart

Autostart can make the app appear as an input source next to HDMI/Live TV.

Enable autostart:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"com.cobalt.youtube.adfree","pigImage":"","mvpdIcon":""}'
```

Disable autostart:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/deleteDevice' '{"appId":"com.cobalt.youtube.adfree"}'
```

Autostart may improve startup time because the app can stay loaded in the background. This can increase idle memory usage.

## Build Cobalt

The repository may include prebuilt Cobalt binaries in `cobalt-bin`.

To build Cobalt yourself, the build process clones Cobalt, applies the patches from `cobalt-patches`, builds `libcobalt.so`, and packages the result.

Example (release/`gold` config):

```sh
make BUILD_COBALT_DEBUG=0 WEBAPP_DEBUG=0 \
  cobalt-bin/23.lts.4-12/libcobalt.so \
  cobalt-bin/23.lts.4-12.xz
```

For a `qa` config with the remote-debugging server compiled in — see
[Building a debug variant](#building-a-debug-variant-remote-devtools) above
for why this specific flag, not `COBALT_DEBUG`, is what actually matters:

```sh
make BUILD_COBALT_TYPE=qa \
  cobalt-bin/23.lts.4-12-logging/libcobalt.so \
  cobalt-bin/23.lts.4-12-logging.xz
```

For a clean rebuild after changing the Cobalt patch:

```sh
make clean-workdir/cobalt-23.lts.4
rm -rf cobalt-bin/23.lts.4-12 cobalt-bin/23.lts.4-12.xz
make BUILD_COBALT_DEBUG=0 WEBAPP_DEBUG=0 \
  cobalt-bin/23.lts.4-12/libcobalt.so \
  cobalt-bin/23.lts.4-12.xz
```

## Development TV setup

### Developer Mode App

Install the Developer Mode app on the TV, enable Developer Mode and enable the keyserver. Then download the private key:

```text
http://TV_IP:9991/webos_rsa
```

Configure the TV:

```sh
ares-setup-device -a webos \
  -i "username=prisoner" \
  -i "privatekey=/path/to/webos_rsa" \
  -i "passphrase=PASSPHRASE" \
  -i "host=TV_IP" \
  -i "port=9922"
```

### Homebrew Channel / root access

Enable SSH in the Homebrew Channel app, copy your public SSH key to the TV, then configure the device:

```sh
ares-setup-device -a webos \
  -i "username=root" \
  -i "privatekey=/path/to/id_rsa" \
  -i "passphrase=SSH_KEY_PASSPHRASE" \
  -i "host=TV_IP" \
  -i "port=22"
```

Give each registered device a distinct, memorable name (`-a <name>` above)
if you work with more than one TV. That name is what selects between them —
but only for the commands that actually operate on a device, like
`ares-install`, `ares-launch` and `ares-inspect` (`-d`/`--device <name>`).
`ares-setup-device` itself doesn't take `--device`: its job is adding,
modifying or removing entries in the device list (`-a`/`-m`/`-r`), not
selecting one to act on. `ares-package` doesn't take it either, since it
only builds a local IPK and never touches a device at all.

This fork's own dev tools don't go through the `ares-*` device registry, so
they don't take `--device` either — they take the TV's IP directly instead,
since `tools/cdp-eval.py` connects over a raw WebSocket rather than through
novacom. `tools/tv-app-restart.sh` needs both: the IP for the DevTools
connection, and the `ares-*` device name for `ares-install`/`ares-launch`,
as two separate arguments (`tv-app-restart.sh <tv-ip> <ares-device-name> [ipk]`).

## Credits

This project builds on research and work from the webOS Homebrew, Cobalt and YouTube TV modification communities.

Special thanks to these projects and maintainers whose work made this project possible:

* [RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree) — the upstream project this fork tracks and builds on
* [NicholasBly/youtube-webos](https://github.com/NicholasBly/youtube-webos)
* [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos)
* [UltraHDR/youtube-webos-cobalt](https://github.com/UltraHDR/youtube-webos-cobalt)
* [LawfulGremlin/youtube-webos](https://github.com/LawfulGremlin/youtube-webos) — source of this fork's shortcut-key registry and frame-stepping actions

If this project helps you, you can support the original maintainer here:

<https://buymeacoffee.com/rf1705>

## License

See the included license files for details.
