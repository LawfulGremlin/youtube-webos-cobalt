# Consecutive seek targets desynchronize the external video pipeline

Observed on the 2.0.4 beta runtime built from `1c39600708b1`.
The TV executable, release IPK executable and Actions artifact have the same
SHA-256: `9bfb097291f48451c60c71a6a884e81585d9abf59591c47577b61ab7e152f0dc`.

The affected player selected the legacy backend with `audio=1 video=6`
(AAC and AV1 in Cobalt 23.lts.6). Audio used FfmpegAudioDecoder; video used
StarfishVideoDecoder. Shared Starfish A/V currently supports eligible Opus
streams, so its default enablement does not change this AAC path.

## TV trace, September 22

Times below are from the existing TV log; media positions are microseconds.

| Wall time | Event | Position |
| --- | --- | --- |
| 21:03:50.166528 | First worker seek | 2103990016 |
| 21:03:50.194772 | Native video flush / target update | 2103990016 |
| 21:03:50.289121 | Second worker seek, before new video input | 2100112768 |
| 21:03:50.370622 | Audio prerolled | |
| 21:03:51.412593 | First visible video frame | 2104166666 |
| 21:03:51.412593 | Decoder's current requested target | 2100112768 |
| 21:03:51.412777 | Video prerolled | |

There is no second native flush. The first visible frame is 4.053898 seconds
ahead of the final requested target. Similar target mismatches appear in earlier
seeks in the same log. This is consistent with the reported sound lag; the log
does not measure actual speaker output latency.

## Cause and fix

`VideoRendererImpl::Seek()` calls `SetSeekTime()` on each seek but previously
called `Reset()` only when `first_input_written_` was true. The first seek
clears that flag. A second seek before new input therefore updates only the
decoder's software target, while the retained Starfish pipeline keeps the old
`setTimeToDecode()` target. Audio is independently reset to the newer target.

The new `NeedsResetOnEverySeek()` decoder hook defaults to false. Only
StarfishVideoDecoder opts in, because its native pipeline survives Reset.
Consecutive seeks now reset and retarget that pipeline even without intervening
input. Other decoders retain their existing reset behavior.

## Validation

The host regression compiles the actual patched Cobalt `Seek()` method with
fake decoder and queue dependencies. It reproduces the stale target before
the fix and passes afterward, including repeated backward/forward seeks and
unchanged software-decoder behavior:

```sh
python3 scripts/test-external-video-seek.py /path/to/patched/cobalt-23.lts.6
```

The seek, playback-controls, repeated-seek and preroll-sync patches also apply
together to the upstream 23.lts.6 files in installer order. An ARM build and TV
playback validation of the fix remain outstanding. No modified runtime has
been installed on the TV.
