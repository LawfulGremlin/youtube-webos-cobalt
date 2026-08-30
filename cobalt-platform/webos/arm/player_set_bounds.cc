#include "starboard/player.h"
#include "starboard/common/log.h"
#include "starboard/shared/starboard/player/player_internal.h"

void SbPlayerSetBounds(SbPlayer player,
                       int z_index,
                       int x,
                       int y,
                       int width,
                       int height) {
  if (!SbPlayerIsValid(player)) {
    SB_DLOG(WARNING) << "SbPlayerSetBounds() called with an invalid player.";
    return;
  }
  player->SetBounds(z_index, x, y, width, height);
}
