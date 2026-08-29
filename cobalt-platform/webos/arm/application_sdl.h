#ifndef STARBOARD_WEBOS_ARM_APPLICATION_SDL_H_
#define STARBOARD_WEBOS_ARM_APPLICATION_SDL_H_

#include <SDL2/SDL.h>

#include <atomic>
#include <string>

#include "starboard/common/mutex.h"
#include "starboard/shared/starboard/queue_application.h"

namespace starboard {
namespace shared {
namespace webos {

class ApplicationSdl : public starboard::QueueApplication {
 public:
  ApplicationSdl();
  ~ApplicationSdl() override;

  static ApplicationSdl* Get();

  SbWindow CreateWindow(const SbWindowOptions* options);
  bool DestroyWindow(SbWindow window);
  void* GetNativeDisplay() const;
  void* GetEglSurface() const { return egl_surface_; }
  int GetEglConfigId() const { return egl_config_id_; }
  const std::string& GetExportedWindowId() const { return exported_window_id_; }
  void SetVideoResolution(int width, int height) {
    video_width_.store(width);
    video_height_.store(height);
  }
  // Starfish needs a valid exported-window geometry before Cobalt necessarily
  // submits its first synthetic punch-out frame.  Configure a full-window
  // fallback immediately; a later AcceptFrame() replaces it with the exact
  // HTML video bounds.
  void ConfigureFullscreenVideo();

 protected:
  void AcceptFrame(SbPlayer player,
                   const scoped_refptr<VideoFrame>& frame,
                   int z_index,
                   int x,
                   int y,
                   int width,
                   int height) override;
  bool IsStartImmediate() override { return true; }
  bool IsPreloadImmediate() override { return false; }
  void Initialize() override;
  void Teardown() override;
  bool MayHaveSystemEvents() override;
  Event* WaitForSystemEventWithTimeout(SbTime time) override;
  void WakeSystemEventWait() override;

 private:
  Event* TranslateEvent(const SDL_Event& event);

  bool sdl_initialized_;
  SbWindow window_;
  SDL_GLContext gl_context_;
  void* egl_surface_;
  int egl_config_id_;
  std::string exported_window_id_;
  std::atomic<int> video_width_{0};
  std::atomic<int> video_height_{0};
  SDL_Rect last_video_original_{0, 0, 0, 0};
  SDL_Rect last_video_source_{0, 0, 0, 0};
  SDL_Rect last_video_destination_{0, 0, 0, 0};
  Mutex exported_geometry_mutex_;
  bool exported_geometry_valid_ = false;
  Uint32 wake_event_type_;
};

}  // namespace webos
}  // namespace shared
}  // namespace starboard

#endif  // STARBOARD_WEBOS_ARM_APPLICATION_SDL_H_
