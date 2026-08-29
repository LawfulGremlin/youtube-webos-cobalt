# Starterless Cobalt on webOS: SDL and Kodi investigation

## Result

A starterless Cobalt build is feasible, but the webOS SDL SDK is not a drop-in
replacement for LG's Cobalt starter. The SDK supplies enough public platform
pieces to implement a new Cobalt Starboard port:

- ARMv7 soft-float cross compiler and sysroot;
- SDL 2 with the webOS video backend;
- Wayland and the webOS Wayland extensions;
- EGL and OpenGL ES 2;
- ALSA and the normal POSIX runtime;
- `StarfishMediaAPIs.h` and a `libplayerAPIs.so.1` link stub.

The missing component is the adapter from Cobalt's Starboard API to those
interfaces. LG's starter currently contains that adapter, together with its
Evergreen loader.

## What the SDK proves

The inspected SDK archive is:

```text
arm-webos-linux-gnueabi_sdk-buildroot_darwin-arm64.tar.bz2
```

Its SDL build reports version 2.24.1 and provides both `libSDL2.a` and
`libSDL2-2.0.so.0`. Inspection and the first hardware probe found that the SDK
static archive contains only SDL's null video backend, so it cannot create a
TV window. The probe therefore uses the pinned webOSbrew SDL 2.30.12 build
already validated by the ScummVM webOS project. Its static archive contains
the Wayland and webOS video backends. SDL exports the normal window/event/GL
entry points and webOS-specific helpers including:

```text
SDL_CreateWindow
SDL_PollEvent
SDL_GL_CreateContext
SDL_webOSGetPanelResolution
SDL_webOSGetRefreshRate
SDL_webOSCreateExportedWindow
```

The older SDK SDL shared binary requires no newer glibc symbol than
`GLIBC_2.9`. The newer webOSbrew SDL is statically linked into the probe to
keep the test package independent of a particular TV's installed SDL version.

The SDK also contains the public Starfish media header and a link-time
`libplayerAPIs.so.1` stub. The real implementation is provided by the TV. This
is important because it gives a starterless port access to LG's hardware video
pipeline without copying the proprietary Cobalt starter.

## Why Kodi works

Kodi is not a single binary that needs no external libraries. Its unified
dependency build compiles the libraries that are not safely supplied by the
target firmware, and the webOS packaging step copies missing dependency
libraries into the application's `lib` directory. Libraries known to exist on
the TV are represented by build-time stubs and are deliberately not packaged.

For presentation Kodi uses the webOS Wayland protocols. For hardware playback
it implements a dedicated media adapter around `StarfishMediaAPIs`:

1. Kodi demuxes the stream itself.
2. It calls `Load()` with `mediaTransportType` set to `BUFFERSTREAM` and
   `contents.format` set to `RAW`.
3. It sends compressed elementary-stream buffers through `Feed()` using a JSON
   payload with `bufferAddr`, `bufferSize`, `pts`, and `esData`.
4. The TV's Starfish pipeline performs hardware decode and punch-out video
   presentation.

This maps closely to Cobalt's Starboard player contract: Cobalt also supplies
compressed audio/video samples, timestamps, EOS, seek, rate and volume calls.
Kodi's implementation is therefore a useful behavioral reference for the
missing Starboard player backend.

## Why the existing Cobalt binary cannot simply use SDL

The current package combines two different halves:

```text
LG starter / Starboard implementation -> Evergreen ABI -> libcobalt.so
```

`libcobalt.so` intentionally does not implement window creation, input,
graphics presentation, audio output, media decode, DRM, storage paths or the
application event loop. Those calls cross the Evergreen ABI into the starter.
SDL only covers part of the first four areas and does not implement the
Starboard ABI.

Upstream Cobalt 23 has an executable Linux/X11 Starboard target, but it cannot
be cross-compiled unchanged for a TV:

- its application and window implementation is X11-specific;
- it uses ALSA for PCM output;
- its reference player dynamically loads FFmpeg decoders and composites CPU
  video frames through XRender;
- its DRM implementation rejects protected playback.

The reusable POSIX, networking, storage and threading parts are still valuable.
Only the platform-facing window/event/graphics/player/property pieces need a
webOS implementation.

## Recommended implementation

Use Cobalt 23.lts.6 / Starboard 13 first, matching the current tested web app
and Evergreen ABI. Add a new executable platform such as
`starboard/webos/arm` rather than changing `evergreen-arm-softfp`.

### Stage 1: native platform probe

The repository now contains this probe in `native-probe`. Build it with an
extracted and relocated buildroot-nc4 SDK and the extracted pinned webOSbrew
SDL ABI archive:

```sh
WEBOS_SDK_ROOT=/path/to/arm-webos-linux-gnueabi_sdk-buildroot \
SDL2_BUNDLE_DIR=/path/to/SDL2-2.30.12-webos-abi \
  scripts/build-starterless-probe.sh
```

Install the generated
`output/org.rf1705.cobalt-starterless-probe_0.1.1_arm.ipk`. It:

- creates a fullscreen GLES2 window;
- logs SDL lifecycle and remote-control events;
- clears and swaps the EGL surface with a slowly changing background;
- loads `libplayerAPIs.so.1` and checks for the `StarfishMediaAPIs`
  constructor without invoking the media pipeline;
- contains no packaged shared libraries.

Press Back or Exit to close it. The probe writes a persistent diagnostic log
for the current boot to `/tmp/cobalt-starterless-probe.log`.

Version 0.1.1 was installed and launched directly on the target TV without the
LG Cobalt starter. The hardware result was:

```text
SDL compiled=2.30.12 linked=2.30.12 video-driver=wayland
panel-resolution=ok 3840x2160 refresh-rate=ok 120
GLES vendor=ARM renderer=Mali-G52 version=OpenGL ES 3.2
exported-video-window=_Window_Id_39
Starfish media pipeline loaded; constructor=present
```

The process remained running after startup and received the expected webOS
foreground lifecycle events. This validates native process startup, the SDL
Wayland backend, EGL/GLES presentation, the exported video-window protocol,
and runtime access to LG's Starfish media library before a long Cobalt build.

### Stage 2: Cobalt shell without playback

Create a Starboard platform by reusing upstream Linux/POSIX implementations
and replacing the X11 layer with SDL:

- `main` and application event loop;
- `SbWindow*` and SDL/EGL platform handle integration;
- `SbInput*` key, pointer and lifecycle translation;
- system paths and public system properties;
- audio sink, initially SDL or the reusable ALSA sink;
- a stub player that reports video unsupported.

The acceptance criterion is the YouTube UI reaching its home screen and being
navigable. Playback is deliberately excluded from this stage.

An initial `webos-arm` target now lives in `cobalt-platform/webos/arm`. It
provides the SDL application loop, webOS lifecycle and remote-input mapping,
Wayland EGL window handles, ARM softfp GN toolchain configuration, and the
normal reusable Linux/POSIX Starboard implementation. The installer keeps the
generated Cobalt checkout reproducible:

```sh
scripts/install-webos-starboard-platform.sh workdir/cobalt-23.lts.6
```

The complete GN graph generates successfully (685 targets). All new platform
sources, the Wayland display adapter, and the old-webOS networking-header
compatibility fix have passed real ARM compilation with the Linux SDK. The
full build is intentionally a separate long-running command:

```sh
NINJA_PARALLEL=4 scripts/build-starterless-cobalt-docker.sh
```

The prepared Docker volume is `ytaf-webos-linux-sdk`; it contains the official
Linux x86_64 buildroot-nc4 SDK. The expected diagnostic output is
`workdir/cobalt-23.lts.6/out/webos-arm-sbversion-13_devel/cobalt`.

### Stage 3: Starfish-backed Starboard player

Implement the Starboard filter-based player contract using
`StarfishMediaAPIs` as the sink:

- translate codec declarations and decoder configuration into the Starfish
  `Load()` JSON;
- translate `SbPlayerWriteSample()` buffers into `Feed()` payloads;
- map need-data, enough-data, playing, paused, EOS and error callbacks;
- implement seek, playback rate, volume and bounds;
- use SDL's exported-window support where available, with the older ACB path as
  a later fallback.

Start with clear H.264/AAC playback. Add VP9, AV1, HDR and protected playback
only after the basic path is stable.

### Stage 4: DRM and compatibility

Widevine is not solved by SDL or by the public Starfish header alone. The
stock starter links LG's Widevine, SVP and crypto libraries and exposes the
corresponding Starboard DRM implementation. A replacement must either:

- implement Starboard DRM against the TV's available CDM interfaces; or
- initially advertise no DRM and accept that protected streams do not play.

The first starterless package should therefore be a separate experimental app
ID and should not replace the working stock-starter package.

## Risk assessment

| Area | SDK coverage | Remaining work |
| --- | --- | --- |
| Process start | Complete | Native `main` and Starboard application loop |
| Window/input | Mostly complete through SDL | Event/key mapping and Starboard wrappers |
| EGL/GLES UI | Complete | SDL native-window integration and validation |
| POSIX/network/storage | Mostly reusable from upstream Cobalt | webOS paths, jail behavior and properties |
| Audio | SDL/ALSA available | Starboard audio-sink integration |
| Clear video | Starfish API available | Full Starboard player adapter |
| HDR/4K | Platform API appears capable | Codec/capability mapping and device tests |
| Widevine/DRM | Not complete | CDM/SVP Starboard implementation |

## Decision

Do not spend more time trying to launch the existing Evergreen
`libcobalt.so` directly with SDL. The productive path is a new executable
Starboard-webOS target, using SDL for the application/window layer and Kodi's
Starfish buffer-stream design as the reference for hardware playback.
