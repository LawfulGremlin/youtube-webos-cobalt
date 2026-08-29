#include "starboard/webos/arm/starfish_video_decoder.h"

#include <inttypes.h>

#include <cstdlib>
#include <functional>

#include "starboard/common/log.h"
#include "starboard/common/string.h"
#include "starboard/webos/arm/application_sdl.h"

namespace starboard {
namespace shared {
namespace webos {
namespace {

const char* CodecName(SbMediaVideoCodec codec) {
  switch (codec) {
    case kSbMediaVideoCodecH264:
      return "H264";
    case kSbMediaVideoCodecVp9:
      return "VP9";
    case kSbMediaVideoCodecAv1:
      return "AV1";
    default:
      return nullptr;
  }
}

}  // namespace

StarfishVideoDecoder::StarfishVideoDecoder(SbMediaVideoCodec codec)
    : codec_(codec),
      media_api_(new StarfishMediaAPIs()),
      pipeline_state_condition_(pipeline_state_mutex_) {
  SB_DCHECK(CodecName(codec));
}

StarfishVideoDecoder::~StarfishVideoDecoder() {
  shutting_down_.store(true);
  if (decoder_thread_) {
    decoder_thread_->ScheduleAndWait([this]() {
      pending_buffer_ = nullptr;
      if (pipeline_loaded_) {
        media_api_->Stop();
        media_api_->Unload();
        pipeline_loaded_ = false;
      }
      media_api_.reset();
    });
    decoder_thread_.reset();
  }
  CancelPendingJobs();
}

void StarfishVideoDecoder::Initialize(const DecoderStatusCB& decoder_status_cb,
                                      const ErrorCB& error_cb) {
  SB_DCHECK(BelongsToCurrentThread());
  SB_DCHECK(decoder_status_cb);
  SB_DCHECK(error_cb);
  decoder_status_cb_ = decoder_status_cb;
  error_cb_ = error_cb;
  decoder_thread_.reset(new starboard::player::JobThread(
      "starfish_video_decoder", 0, kSbThreadPriorityHigh));
}

void StarfishVideoDecoder::InitializePipeline(
    const SbMediaVideoSampleInfo& sample_info) {
  SB_DCHECK(decoder_thread_->BelongsToCurrentThread());
  const int width =
      sample_info.frame_width > 0 ? sample_info.frame_width : 1920;
  const int height =
      sample_info.frame_height > 0 ? sample_info.frame_height : 1080;
  if (width != video_width_ || height != video_height_) {
    video_width_ = width;
    video_height_ = height;
    ApplicationSdl::Get()->SetVideoResolution(width, height);
    ApplicationSdl::Get()->ConfigureFullscreenVideo();
  }
  if (pipeline_loaded_) {
    return;
  }

  const char* codec_name = CodecName(codec_);
  const char* app_id = std::getenv("APPID");
  if (!app_id || !*app_id) {
    app_id = "org.rf1705.cobalt-starterless";
  }
  const std::string& window_id = ApplicationSdl::Get()->GetExportedWindowId();
  if (window_id.empty()) {
    ReportError("SDL did not create a webOS exported video window.");
    return;
  }

  const int64_t target_pts_ns = seek_to_time_.load() * 1000;
  std::string payload = FormatString(
      "{\"args\":[{\"mediaTransportType\":\"BUFFERSTREAM\","
      "\"option\":{\"windowId\":\"%s\",\"appId\":\"%s\","
      "\"externalStreamingInfo\":{\"contents\":{\"codec\":{" 
      "\"video\":\"%s\"},\"esInfo\":{\"pauseAtDecodeTime\":true,"
      "\"seperatedPTS\":true,\"ptsToDecode\":%" PRId64
      ",\"videoWidth\":%d,"
      "\"videoHeight\":%d,\"videoFpsValue\":60,\"videoFpsScale\":1},"
      "\"format\":\"RAW\"},\"bufferingCtrInfo\":{\"preBufferByte\":0,"
      "\"bufferMinLevel\":0,\"bufferMaxLevel\":0,"
      "\"qBufferLevelVideo\":1048576,\"srcBufferLevelVideo\":{"
      "\"minimum\":1048576,\"maximum\":8388608}}},"
      "\"transmission\":{\"contentsType\":\"LIVE\"},"
      "\"needAudio\":false,\"seekMode\":\"late_Iframe\"}}]}",
      window_id.c_str(), app_id, codec_name, target_pts_ns, width, height);

  SB_LOG(INFO) << "Loading Starfish hardware decoder for " << codec_name
               << " at " << width << "x" << height
               << " using window " << window_id;
  media_api_->notifyForeground();
  if (!media_api_->Load(payload.c_str(), &StarfishVideoDecoder::PlayerCallback,
                        this)) {
    ReportError("StarfishMediaAPIs::Load() failed.");
    return;
  }
  pipeline_loaded_ = true;
}

void StarfishVideoDecoder::WriteInputBuffers(
    const InputBuffers& input_buffers) {
  SB_DCHECK(BelongsToCurrentThread());
  SB_DCHECK(input_buffers.size() == 1);
  SB_DCHECK(input_buffers[0]);
  SB_DCHECK(decoder_thread_);
  if (stream_ended_) {
    return;
  }
  const scoped_refptr<InputBuffer> input = input_buffers[0];
  decoder_thread_->Schedule(
      std::bind(&StarfishVideoDecoder::FeedBuffer, this, input));
}

void StarfishVideoDecoder::FeedBuffer(
    const scoped_refptr<InputBuffer>& input_buffer) {
  SB_DCHECK(decoder_thread_->BelongsToCurrentThread());
  InitializePipeline(input_buffer->video_sample_info());
  if (!pipeline_loaded_) {
    return;
  }

  const uintptr_t address =
      reinterpret_cast<uintptr_t>(input_buffer->data());
  std::string feed_payload = FormatString(
      "{\"bufferAddr\":\"0x%" PRIxPTR "\",\"bufferSize\":%d,"
      "\"pts\":%" PRId64 ",\"esData\":1}",
      address, input_buffer->size(),
      static_cast<int64_t>(input_buffer->timestamp()) * 1000);
  std::string result = media_api_->Feed(feed_payload.c_str());
  if (result.find("Ok") != std::string::npos) {
    pending_buffer_ = nullptr;
    // Feed acceptance only controls compressed-input backpressure.  Cobalt's
    // video preroll is completed by the first real FRAMEREADY event below, so
    // its audio clock cannot run ahead of the hardware video pipeline.
    Schedule(std::bind(decoder_status_cb_, kNeedMoreInput,
                       scoped_refptr<VideoFrame>()));
    return;
  }
  if (result.find("BufferFull") != std::string::npos) {
    pending_buffer_ = input_buffer;
    Schedule(std::bind(decoder_status_cb_, kBufferFull,
                       scoped_refptr<VideoFrame>()));
    decoder_thread_->Schedule(
        std::bind(&StarfishVideoDecoder::RetryPendingBuffer, this),
        5 * kSbTimeMillisecond);
    return;
  }
  ReportError("Starfish Feed() failed: " + result);
}

void StarfishVideoDecoder::RetryPendingBuffer() {
  SB_DCHECK(decoder_thread_->BelongsToCurrentThread());
  if (pending_buffer_ && !shutting_down_.load()) {
    scoped_refptr<InputBuffer> input = pending_buffer_;
    FeedBuffer(input);
  }
}

void StarfishVideoDecoder::WriteEndOfStream() {
  SB_DCHECK(BelongsToCurrentThread());
  stream_ended_ = true;
  if (!decoder_thread_) {
    decoder_status_cb_(kBufferFull, VideoFrame::CreateEOSFrame());
    return;
  }
  decoder_thread_->Schedule(
      std::bind(&StarfishVideoDecoder::WriteEndOfStreamOnDecoderThread, this));
}

void StarfishVideoDecoder::WriteEndOfStreamOnDecoderThread() {
  SB_DCHECK(decoder_thread_->BelongsToCurrentThread());
  if (!pipeline_loaded_ || !media_api_->pushEOS()) {
    eos_output_ = true;
    Schedule(std::bind(decoder_status_cb_, kBufferFull,
                       VideoFrame::CreateEOSFrame()));
  }
}

void StarfishVideoDecoder::Reset() {
  SB_DCHECK(BelongsToCurrentThread());
  stream_ended_ = false;
  eos_output_ = false;
  preroll_frame_sent_.store(false);
  if (decoder_thread_) {
    decoder_thread_->ScheduleAndWait(
        std::bind(&StarfishVideoDecoder::ResetOnDecoderThread, this));
  }
  CancelPendingJobs();
}

void StarfishVideoDecoder::ResetOnDecoderThread() {
  SB_DCHECK(decoder_thread_->BelongsToCurrentThread());
  pending_buffer_ = nullptr;
  if (!pipeline_loaded_) {
    return;
  }

  // Starfish BUFFERSTREAM requires a new segment after flush.  That operation
  // is not exposed by the public webOS SDK, and merely changing its clock
  // leaves the previous segment active.  Recreate the public pipeline instead;
  // the next input sample supplies fresh dimensions and ptsToDecode in Load().
  reset_in_progress_.store(true);
  unload_completed_.store(false);
  media_api_->Stop();
  if (media_api_->Unload()) {
    pipeline_state_mutex_.Acquire();
    if (!unload_completed_.load() &&
        !pipeline_state_condition_.WaitTimed(kSbTimeSecond)) {
      SB_LOG(WARNING) << "Timed out waiting for Starfish unload.";
    }
    pipeline_state_mutex_.Release();
  } else {
    SB_LOG(WARNING) << "StarfishMediaAPIs::Unload() failed during reset.";
  }
  media_api_.reset(new StarfishMediaAPIs());
  pipeline_loaded_ = false;
  video_width_ = 0;
  video_height_ = 0;
  reset_in_progress_.store(false);
}

void StarfishVideoDecoder::SignalUnloadCompleted() {
  pipeline_state_mutex_.Acquire();
  unload_completed_.store(true);
  pipeline_state_condition_.Broadcast();
  pipeline_state_mutex_.Release();
}

SbDecodeTarget StarfishVideoDecoder::GetCurrentDecodeTarget() {
  return kSbDecodeTargetInvalid;
}

void StarfishVideoDecoder::ReportError(const std::string& message) {
  SB_LOG(ERROR) << message;
  Schedule(std::bind(error_cb_, kSbPlayerErrorDecode, message));
}

void StarfishVideoDecoder::HandlePlayerEvent(int type,
                                             int64_t num_value,
                                             const char* str_value) {
  if (shutting_down_.load()) {
    return;
  }
  if (type == PF_EVENT_TYPE_STR_STATE_UPDATE__UNLOADCOMPLETED) {
    SignalUnloadCompleted();
    return;
  }
  if (reset_in_progress_.load()) {
    return;
  }
  if (type == PF_EVENT_TYPE_FRAMEREADY) {
    const SbTime frame_time = static_cast<SbTime>(num_value / 1000);
    const SbTime target_time = seek_to_time_.load();
    if (frame_time >= target_time &&
        !preroll_frame_sent_.exchange(true)) {
      SB_LOG(INFO) << "Starfish first visible frame reached target: frame="
                   << frame_time << " target=" << target_time;
      Schedule(std::bind(decoder_status_cb_, kNeedMoreInput,
                         scoped_refptr<VideoFrame>(new VideoFrame(frame_time))));
    }
    return;
  }
  SB_LOG(INFO) << "Starfish event type=" << type << " value=" << num_value
               << " text=" << (str_value ? str_value : "");
  if (type == PF_EVENT_TYPE_STR_STATE_UPDATE__LOADCOMPLETED) {
    media_api_->Play();
  } else if (type == PF_EVENT_TYPE_INT_NEED_DATA) {
    if (decoder_thread_) {
      decoder_thread_->Schedule(
          std::bind(&StarfishVideoDecoder::RetryPendingBuffer, this));
    }
  } else if ((type == PF_EVENT_TYPE_STR_STATE_UPDATE__ENDOFSTREAM) &&
             !eos_output_) {
    eos_output_ = true;
    Schedule(std::bind(decoder_status_cb_, kBufferFull,
                       VideoFrame::CreateEOSFrame()));
  } else if (type == PF_EVENT_TYPE_INT_ERROR ||
             type == PF_EVENT_TYPE_STR_ERROR) {
    ReportError(FormatString("Starfish pipeline error %d/%" PRId64 ": %s",
                             type, num_value, str_value ? str_value : ""));
  }
}

void StarfishVideoDecoder::PlayerCallback(int type,
                                          int64_t num_value,
                                          const char* str_value,
                                          void* context) {
  StarfishVideoDecoder* decoder =
      static_cast<StarfishVideoDecoder*>(context);
  if (!decoder || decoder->shutting_down_.load()) {
    return;
  }
  decoder->HandlePlayerEvent(type, num_value, str_value);
}

}  // namespace webos
}  // namespace shared
}  // namespace starboard
