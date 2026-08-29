#ifndef STARBOARD_WEBOS_ARM_STARFISH_VIDEO_DECODER_H_
#define STARBOARD_WEBOS_ARM_STARFISH_VIDEO_DECODER_H_

#include <atomic>
#include <string>

#include <starfish-media-pipeline/StarfishMediaAPIs.h>

#include "starboard/common/condition_variable.h"
#include "starboard/common/mutex.h"
#include "starboard/common/scoped_ptr.h"
#include "starboard/media.h"
#include "starboard/shared/starboard/player/filter/video_decoder_internal.h"
#include "starboard/shared/starboard/player/job_queue.h"
#include "starboard/shared/starboard/player/job_thread.h"

namespace starboard {
namespace shared {
namespace webos {

class StarfishVideoDecoder
    : public starboard::player::filter::VideoDecoder,
      private starboard::player::JobQueue::JobOwner {
 public:
  explicit StarfishVideoDecoder(SbMediaVideoCodec codec);
  ~StarfishVideoDecoder() override;

  void Initialize(const DecoderStatusCB& decoder_status_cb,
                  const ErrorCB& error_cb) override;
  size_t GetPrerollFrameCount() const override { return 1; }
  SbTime GetPrerollTimeout() const override { return 2 * kSbTimeSecond; }
  size_t GetMaxNumberOfCachedFrames() const override { return 12; }
  void SetSeekTime(SbTime seek_to_time) override {
    seek_to_time_.store(seek_to_time);
  }
  void WriteInputBuffers(const InputBuffers& input_buffers) override;
  void WriteEndOfStream() override;
  void Reset() override;
  SbDecodeTarget GetCurrentDecodeTarget() override;

 private:
  void InitializePipeline(const SbMediaVideoSampleInfo& sample_info);
  void FeedBuffer(const scoped_refptr<InputBuffer>& input_buffer);
  void RetryPendingBuffer();
  void WriteEndOfStreamOnDecoderThread();
  void ResetOnDecoderThread();
  void SignalUnloadCompleted();
  void ReportError(const std::string& message);
  void HandlePlayerEvent(int type, int64_t num_value, const char* str_value);
  static void PlayerCallback(int type,
                             int64_t num_value,
                             const char* str_value,
                             void* context);

  SbMediaVideoCodec codec_;
  scoped_ptr<StarfishMediaAPIs> media_api_;
  scoped_ptr<starboard::player::JobThread> decoder_thread_;
  DecoderStatusCB decoder_status_cb_;
  ErrorCB error_cb_;
  scoped_refptr<InputBuffer> pending_buffer_;
  Mutex pipeline_state_mutex_;
  ConditionVariable pipeline_state_condition_;
  bool pipeline_loaded_ = false;
  bool stream_ended_ = false;
  bool eos_output_ = false;
  int video_width_ = 0;
  int video_height_ = 0;
  std::atomic<SbTime> seek_to_time_{0};
  std::atomic<bool> preroll_frame_sent_{false};
  std::atomic<bool> reset_in_progress_{false};
  std::atomic<bool> unload_completed_{false};
  std::atomic<bool> shutting_down_{false};
};

}  // namespace webos
}  // namespace shared
}  // namespace starboard

#endif  // STARBOARD_WEBOS_ARM_STARFISH_VIDEO_DECODER_H_
