#include "starboard/window.h"

#include "starboard/webos/arm/application_sdl.h"

bool SbWindowDestroy(SbWindow window) {
  return starboard::shared::webos::ApplicationSdl::Get()->DestroyWindow(window);
}
