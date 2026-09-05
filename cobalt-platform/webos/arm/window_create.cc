#include "starboard/window.h"

#include "starboard/webos/arm/application_sdl.h"

SbWindow SbWindowCreate(const SbWindowOptions* options) {
  return starboard::shared::webos::ApplicationSdl::Get()->CreateWindow(options);
}
