#include "starboard/window.h"

#include "starboard/webos/arm/window_internal.h"

void* SbWindowGetPlatformHandle(SbWindow window) {
  return SbWindowIsValid(window) ? window->egl_window : nullptr;
}
