# Community device compatibility

This page summarizes device reports from the issue tracker. It is a record of
individual test results, not a guarantee that every TV of the same model will
behave identically. Firmware, webOS updates, installation method, sign-in state
and the exact application build can change the result.

Last reviewed: 2026-07-18

## Build names used below

- **v1.0.0**: first public side-by-side release using app ID
  `com.cobalt.youtube.adfree`. It was based on the official YouTube 1.1.7
  package, so some reports call this build "1.1.7".
- **v1.1.0**: current release using the original app ID
  `youtube.leanback.v4`.
- **compat v1.1.1-beta**: separate compatibility test using the starter from
  the official 2022 YouTube 1.1.4 package.
- **v5/v8**: pre-release diagnostic builds using the original YouTube app ID.

`Unknown` means that the reporter did not provide the value. An installation
that is rejected or appears stuck is listed separately from a package that
installs successfully and then fails to start.

## Installation, startup and playback reports

| Model | webOS | Firmware | SoC/platform | Root | Build and result | Source |
| --- | --- | --- | --- | --- | --- | --- |
| LG CineBeam HU710PB-GL | 6.3.1 | 03.00.27 | k7lp | No, Developer Mode | v8 started and its basic patch functions worked. v1.0.0 installs, shows black for 1–2 seconds, then exits. | [#1](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1) |
| LG 43UP8000PTB | 6.5.3-47 | 03.53.45 | Unknown | No, Developer Mode | v1.0.0 initially appeared stuck during installation; it was later confirmed installed and working. | [#1](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1#issuecomment-4920893433), [#7](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/7) |
| LG 55UP7760PVB | 6.5.3-47 | 03.53.45 | Unknown | No | v1.0.0 installs but crashes before the YouTube logo. Compat beta remains stuck during installation. | [#15](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/15) |
| LG 55UP7750PSB | 6.0 | 03.53.45 | Unknown | Unknown | v8 started. v1.1.0 and compat beta both exit immediately. | [#1 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1#issuecomment-5011207220) |
| LG 55UP7750PVB | 6.5.3 | 03.53.45 | Unknown | No | v1.1.0 and compat beta show black for about two seconds and exit. | [#1 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1#issuecomment-5011641540) |
| LG 55UH617V | 3.4.3 | Unknown | Unknown | Unknown | Normal build exits immediately. Compat beta shows grey briefly and then exits. | [#14](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/14) |
| Unspecified LG 43-inch model | 3.9.2 | Unknown | Unknown | Unknown | v1.0.0 exits immediately. | [#3 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/3#issuecomment-4923249482) |
| LG C1 OLED | 6.3.2 | 03.34.55 | O20N | Yes | v8 plays video. v1.0.0 installs and opens, but video remains black. | [#3](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/3) |
| LG C1 OLED | 6.5.3-47 | 03.53.45 | Unknown | No | v1.0.0 played after reopening/waiting. Maximum quality was 1080p; RYD failed and SponsorBlock could loop at the end of a video. | [#3 comments](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/3#issuecomment-4921907497) |
| LG OLED65C1RLA | Unknown | Unknown | Unknown | Unknown | v1.1.0 could not be installed. Compat beta installed, but ad blocking was reported not to work. | [#17 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/17#issuecomment-5011474389) |
| LG G1 | Not confirmed | 03.53.45 | Unknown | No | v1.0.0 transfer was slow and installation remained in progress. The reported `6.5.3` may be webOS or a manager version. | [#17](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/17) |
| Unspecified k7lp device | Unknown | Unknown | k7lp | Unknown | Reporter reproduced the startup problem and traced it to a null-pointer crash. | [#1 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1#issuecomment-4921736524) |
| Unspecified model | 6.5.3 | 03.53.45 | Unknown | Unknown | v1.0.0 crashed after credentials were entered with the remote. Phone-based sign-in allowed it to work. A SIGSEGV was logged in `SplashScreenWeb`. | [#1 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/1#issuecomment-4951148407) |

The issue tracker also contains startup reports without enough device details
to add a model row, notably [#10](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/10).

## Reports from devices that reach the application

These reports show that installation and startup work at least far enough to
test application features. They may still contain playback or integration
problems.

| Model | webOS | Firmware | Root | Observed result | Source |
| --- | --- | --- | --- | --- | --- |
| LG TV65QNED (exact model not reported) | 6.5.3 | 03.53.45 | No | Playback and ad blocking work; maximum quality is 1080p. SoC reported as `Im21u`. | [#2](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2) |
| LG 65QNED913PA | 6.5.3-47 | 03.53.45 | No | Patched Cobalt offers 1080p while the official LG app plays 2160p. | [#2 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-5010822714) |
| LG OLED55G19LA | 6.5.3 | 03.53.45 | Unknown | Maximum selectable quality is 1080p. | [#2 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-4951770514) |
| LG 7070NANO75SPA | 6.5.3-47 | Unknown | No | Initial report: no 4K and sponsored recommendations. A later v1.1.0 test showed a 4K option; playback confirmation remains unclear. | [initial report](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-4975618738), [v1.1.0 test](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-5012293973) |
| LG OLED65A1PVA | 6.5.3 | 03.53.45 | No | Maximum selectable quality is 1080p. | [#2 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-4991938401) |
| LG OLED55C1AUB | Unknown | Unknown | Unknown | Maximum selectable quality is 1080p. | [#2 comment](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/2#issuecomment-5010378790) |
| LG B1 | Unknown | Unknown | Yes | App runs, but v1.0.0 cannot receive normal phone casting because it uses a separate app ID. Addressed by the original app ID in v1.1.0. | [#5](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/5) |
| LG OLED55C1AUB | 6.5.0 | 03.51.16 | Unknown | App runs, but EIM/autostart registration does not work. | [#6](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/6) |
| LG OLED65C1AUB | 6.5.3 | 03.53.45 | Unknown | App runs, but EIM/autostart registration does not work. | [#6](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/6) |
| LG C1 | Unknown | 03.53.45 | Unknown | Sponsored home-screen items were reported with v1.0.0. Additional filtering was added in v1.1.0. | [#9](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/9) |
| LG C1 | Unknown | Unknown | Unknown | Some videos report a YouTube error after 30–50 seconds. | [#11](https://github.com/RF1705/youtube-webos-cobalt-adfree/issues/11) |

## Unpatched baseline test

Before diagnosing a starter, runtime or injected JavaScript failure, affected
users can test the unmodified official packages used by the project:

- [Official YouTube 1.1.4 (2022 package)](https://raw.githubusercontent.com/RF1705/youtube-webos-cobalt-adfree/main/ipks-official/2022-12-01-youtube.leanback.v4-1.1.4.ipk)
- [Official YouTube 1.1.7 (2023 package)](https://raw.githubusercontent.com/RF1705/youtube-webos-cobalt-adfree/main/ipks-official/2023-07-30-youtube.leanback.v4-1.1.7.ipk)

Both packages use the original `youtube.leanback.v4` app ID and may replace the
installed YouTube application. Test only if you can restore or reinstall it.

An installation rejection or installer hang does not prove runtime
incompatibility. The useful distinction is whether a package installs
successfully and then fails to start or play video.

## Reporting a new result

Please include all fields below when opening or updating an issue:

```text
TV model:
webOS version:
Firmware version:
SoC/platform (if known):
Rooted: yes/no
Installation method:
Tested package/build:
Installation: success/rejected/stuck
Startup: home screen/crash/black screen
Playback: works/black/error/not tested
Maximum quality:
Ad blocking:
SponsorBlock:
Sign-in method: phone/remote/not signed in
```

When possible, test the official 1.1.4 and 1.1.7 baseline packages as well as
the patched build. This helps separate base-package compatibility from a Cobalt
runtime or injected JavaScript regression.
