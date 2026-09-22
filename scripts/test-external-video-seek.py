#!/usr/bin/env python3
"""Host regression for the real Cobalt Seek method, with fake decoder/queues.

Pass a Cobalt 23.lts.6 source tree with the external-video-seek patch applied.
The repeated-seek fix is applied to a temporary copy if needed. No SDK required.
"""

import argparse
import os
from pathlib import Path
import subprocess
import tempfile


def method(source, signature):
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cobalt_source", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    relative = Path("starboard/shared/starboard/player/filter")
    with tempfile.TemporaryDirectory(prefix="ytaf-seek-") as temporary:
        root = Path(temporary)
        folder = root / relative
        folder.mkdir(parents=True)
        for name in ("video_renderer_internal_impl.cc", "video_decoder_internal.h"):
            (folder / name).write_text((args.cobalt_source / relative / name).read_text())
        renderer = folder / "video_renderer_internal_impl.cc"
        if "decoder_->NeedsResetOnEverySeek()" not in renderer.read_text():
            subprocess.run([
                "git", "apply", str(repo / "cobalt-platform" /
                    "cobalt-23.lts.6-webos-external-video-repeated-seek.patch")
            ], cwd=root, check=True)
        seek = method(renderer.read_text(), "void VideoRendererImpl::Seek(")
        interface = (folder / "video_decoder_internal.h").read_text()
        hardware = (repo / "cobalt-platform/webos/arm/starfish_video_decoder.h").read_text()
        default_policy = method(interface, "virtual bool NeedsResetOnEverySeek()")
        hardware_policy = method(hardware, "bool NeedsResetOnEverySeek()")
        set_target = method(hardware, "void SetSeekTime(")
        fixture = r'''
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <functional>
#include <limits>
#include <vector>
using SbTime = int64_t;
constexpr SbTime kSbTimeMax = std::numeric_limits<SbTime>::max();
#define SB_DCHECK(condition) do { if (!(condition)) std::abort(); } while (0)
struct ScopedLock { explicit ScopedLock(int&) {} };
struct Decoder {
  virtual ~Decoder() = default;
  DEFAULT_POLICY
  virtual void SetSeekTime(SbTime) {}
  void Reset() { ++resets; native_target = seek_to_time_.load(); }
  SbTime GetPrerollTimeout() const { return kSbTimeMax; }
  std::atomic<SbTime> seek_to_time_{0};
  SbTime native_target = -1;
  unsigned resets = 0;
};
struct Hardware : Decoder {
  HARDWARE_POLICY
  SET_TARGET
};
struct Algorithm { void Seek(SbTime time) { target = time; } SbTime target = 0; };
struct VideoRendererImpl {
  explicit VideoRendererImpl(Decoder* decoder) : decoder_(decoder) {}
  void Seek(SbTime);
  bool BelongsToCurrentThread() { return true; }
  void CancelPendingJobs() {}
  void OnSeekTimeout() {}
  template <typename F> void Schedule(F, SbTime) {}
  Decoder* decoder_;
  bool first_input_written_ = false;
  SbTime seeking_to_time_ = 0;
  std::atomic<bool> seeking_{false}, end_of_stream_written_{false},
      end_of_stream_decoded_{false}, need_more_input_{false}, ended_cb_called_{false};
  std::atomic<int> number_of_frames_{0};
  int decoder_frames_mutex_ = 0, sink_frames_mutex_ = 0;
  std::vector<int> decoder_frames_, sink_frames_;
  Algorithm algorithm;
  Algorithm* algorithm_ = &algorithm;
};
SEEK_METHOD
int main() {
  Hardware hardware;
  VideoRendererImpl renderer(&hardware);
  renderer.first_input_written_ = true;  // Previously playing video.
  renderer.Seek(2103990016);             // First target from the TV trace.
  if (hardware.native_target != 2103990016) return 1;
  renderer.Seek(2100112768);             // Corrected target before new input.
  if (hardware.native_target != renderer.algorithm.target) return 2;
  if (hardware.resets != 2) return 3;
  renderer.Seek(2300000000);             // Also allow a subsequent forward seek.
  if (hardware.native_target != 2300000000 || hardware.resets != 3) return 4;
  renderer.first_input_written_ = true;
  renderer.Seek(0);                      // A normal seek after new input.
  if (hardware.native_target != 0 || hardware.resets != 4) return 5;
  Decoder software;
  VideoRendererImpl other(&software);
  other.Seek(100);                       // Preserve software-decoder behavior.
  if (software.resets != 0) return 6;
  other.first_input_written_ = true;
  other.Seek(200);
  other.Seek(300);
  if (software.resets != 1) return 7;
}
'''
        for key, value in (("DEFAULT_POLICY", default_policy),
                           ("HARDWARE_POLICY", hardware_policy),
                           ("SET_TARGET", set_target), ("SEEK_METHOD", seek)):
            fixture = fixture.replace(key, value)
        compiler = os.environ.get("CXX", "c++")
        for fixed in (False, True):
            source = fixture if fixed else fixture.replace(
                "first_input_written_ || decoder_->NeedsResetOnEverySeek()",
                "first_input_written_")
            cpp = root / "regression.cc"
            cpp.write_text(source)
            binary = root / "regression"
            subprocess.run([compiler, "-std=c++14", "-Wall", "-Wextra", "-Werror",
                            str(cpp), "-o", str(binary)], check=True)
            result = subprocess.run([str(binary)])
            expected = 0 if fixed else 2
            if result.returncode != expected:
                raise RuntimeError(f"fixed={fixed}: expected {expected}, got {result.returncode}")
        print("Reproduced stale native target before fix; repeated-seek regression passed after fix.")


if __name__ == "__main__":
    main()
