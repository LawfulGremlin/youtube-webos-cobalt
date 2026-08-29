#ifndef STARBOARD_WEBOS_ARM_CONFIGURATION_PUBLIC_H_
#define STARBOARD_WEBOS_ARM_CONFIGURATION_PUBLIC_H_

// The TV ABI is ARMv7 soft-float. The remaining POSIX/GCC capabilities match
// the mature Raspberry Pi executable Starboard port closely.
#include "starboard/raspi/shared/configuration_public.h"

#undef SB_HAS_NV12_TEXTURE_SUPPORT
#define SB_HAS_NV12_TEXTURE_SUPPORT 0

#endif  // STARBOARD_WEBOS_ARM_CONFIGURATION_PUBLIC_H_
