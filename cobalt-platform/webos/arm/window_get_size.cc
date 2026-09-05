#include "starboard/window.h"

#include "starboard/webos/arm/window_internal.h"

bool SbWindowGetSize(SbWindow window, SbWindowSize* size) {
  if (!SbWindowIsValid(window) || !size) {
    return false;
  }
  size->width = window->width;
  size->height = window->height;
  // Cobalt uses this ratio to advertise a higher video-output resolution
  // than its GLES/UI render target.  A 4K panel with a 1080p graphics window
  // therefore remains eligible for native 4K streams.
  size->video_pixel_ratio = window->video_pixel_ratio;
  return true;
}
