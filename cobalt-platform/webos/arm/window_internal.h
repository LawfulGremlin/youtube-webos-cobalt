#ifndef STARBOARD_WEBOS_ARM_WINDOW_INTERNAL_H_
#define STARBOARD_WEBOS_ARM_WINDOW_INTERNAL_H_

#include <SDL2/SDL.h>

#include "starboard/window.h"

struct wl_display;
struct wl_egl_window;

struct SbWindowPrivate {
  SbWindowPrivate(SDL_Window* sdl_window,
                  wl_display* display,
                  wl_egl_window* egl_window,
                  int width,
                  int height,
                  float video_pixel_ratio)
      : sdl_window(sdl_window),
        display(display),
        egl_window(egl_window),
        width(width),
        height(height),
        video_pixel_ratio(video_pixel_ratio) {}

  SDL_Window* sdl_window;
  wl_display* display;
  wl_egl_window* egl_window;
  int width;
  int height;
  float video_pixel_ratio;
};

#endif  // STARBOARD_WEBOS_ARM_WINDOW_INTERNAL_H_
