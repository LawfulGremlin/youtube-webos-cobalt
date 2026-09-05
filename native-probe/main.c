#define SDL_MAIN_HANDLED

#include <SDL2/SDL.h>
#include <SDL2/SDL_webOS.h>
#include <GLES2/gl2.h>

#include <dlfcn.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

static FILE* log_file;

static void probe_log(const char* format, ...) {
  va_list arguments;
  va_start(arguments, format);

  fprintf(stderr, "[starterless-probe %10u] ", SDL_GetTicks());
  vfprintf(stderr, format, arguments);
  fputc('\n', stderr);
  fflush(stderr);

  va_end(arguments);
  va_start(arguments, format);
  if (log_file) {
    fprintf(log_file, "[%10u] ", SDL_GetTicks());
    vfprintf(log_file, format, arguments);
    fputc('\n', log_file);
    fflush(log_file);
  }
  va_end(arguments);
}

static const char* event_name(Uint32 type) {
  switch (type) {
    case SDL_QUIT:
      return "quit";
    case SDL_APP_TERMINATING:
      return "terminating";
    case SDL_APP_LOWMEMORY:
      return "low-memory";
    case SDL_APP_WILLENTERBACKGROUND:
      return "will-enter-background";
    case SDL_APP_DIDENTERBACKGROUND:
      return "did-enter-background";
    case SDL_APP_WILLENTERFOREGROUND:
      return "will-enter-foreground";
    case SDL_APP_DIDENTERFOREGROUND:
      return "did-enter-foreground";
    case SDL_KEYDOWN:
      return "key-down";
    case SDL_KEYUP:
      return "key-up";
    case SDL_MOUSEMOTION:
      return "mouse-motion";
    case SDL_MOUSEBUTTONDOWN:
      return "mouse-button-down";
    case SDL_MOUSEBUTTONUP:
      return "mouse-button-up";
    default:
      return "other";
  }
}

static void probe_player_api(void) {
  void* player_api = dlopen("libplayerAPIs.so.1", RTLD_LAZY | RTLD_LOCAL);
  if (!player_api) {
    probe_log("Starfish media pipeline unavailable: %s", dlerror());
    return;
  }

  dlerror();
  void* constructor = dlsym(player_api, "_ZN17StarfishMediaAPIsC1EPKc");
  const char* symbol_error = dlerror();
  probe_log("Starfish media pipeline loaded; constructor=%s",
            constructor && !symbol_error ? "present" : "missing");
  if (symbol_error) {
    probe_log("Starfish constructor lookup error: %s", symbol_error);
  }
  dlclose(player_api);
}

static bool should_quit_for_key(const SDL_KeyboardEvent* key) {
  const int scancode = (int)key->keysym.scancode;
  return scancode == SDL_WEBOS_SCANCODE_BACK ||
         scancode == SDL_WEBOS_SCANCODE_EXIT ||
         key->keysym.scancode == SDL_SCANCODE_AC_BACK ||
         key->keysym.scancode == SDL_SCANCODE_ESCAPE;
}

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;

  log_file = fopen("/tmp/cobalt-starterless-probe.log", "a");
  probe_log("probe starting");
  probe_log("environment APPID=%s XDG_RUNTIME_DIR=%s WAYLAND_DISPLAY=%s "
            "SDL_VIDEODRIVER=%s",
            getenv("APPID") ? getenv("APPID") : "<unset>",
            getenv("XDG_RUNTIME_DIR") ? getenv("XDG_RUNTIME_DIR") : "<unset>",
            getenv("WAYLAND_DISPLAY") ? getenv("WAYLAND_DISPLAY") : "<unset>",
            getenv("SDL_VIDEODRIVER") ? getenv("SDL_VIDEODRIVER") : "<unset>");

  SDL_SetMainReady();
  SDL_SetHint(SDL_HINT_WEBOS_REGISTER_APP, "1");
  SDL_SetHint(SDL_HINT_WEBOS_ACCESS_POLICY_KEYS_BACK, "1");
  SDL_SetHint(SDL_HINT_WEBOS_ACCESS_POLICY_KEYS_EXIT, "1");
  SDL_SetHint(SDL_HINT_WEBOS_CURSOR_SLEEP_TIME, "3000");

  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) != 0) {
    probe_log("SDL_Init failed: %s", SDL_GetError());
    return 10;
  }

  SDL_version compiled;
  SDL_version linked;
  SDL_VERSION(&compiled);
  SDL_GetVersion(&linked);
  probe_log("SDL compiled=%u.%u.%u linked=%u.%u.%u video-driver=%s",
            compiled.major, compiled.minor, compiled.patch, linked.major,
            linked.minor, linked.patch, SDL_GetCurrentVideoDriver());

  int panel_width = 0;
  int panel_height = 0;
  int refresh_rate = 0;
  probe_log("panel-resolution=%s %dx%d refresh-rate=%s %d",
            SDL_webOSGetPanelResolution(&panel_width, &panel_height) ? "ok"
                                                                    : "failed",
            panel_width, panel_height,
            SDL_webOSGetRefreshRate(&refresh_rate) ? "ok" : "failed",
            refresh_rate);

  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 2);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
  SDL_GL_SetAttribute(SDL_GL_RED_SIZE, 8);
  SDL_GL_SetAttribute(SDL_GL_GREEN_SIZE, 8);
  SDL_GL_SetAttribute(SDL_GL_BLUE_SIZE, 8);
  SDL_GL_SetAttribute(SDL_GL_ALPHA_SIZE, 8);

  SDL_Window* window = SDL_CreateWindow(
      "Cobalt Starterless Probe", SDL_WINDOWPOS_UNDEFINED,
      SDL_WINDOWPOS_UNDEFINED, panel_width > 0 ? panel_width : 1920,
      panel_height > 0 ? panel_height : 1080,
      SDL_WINDOW_OPENGL | SDL_WINDOW_FULLSCREEN | SDL_WINDOW_SHOWN);
  if (!window) {
    probe_log("SDL_CreateWindow failed: %s", SDL_GetError());
    SDL_Quit();
    return 11;
  }

  SDL_GLContext gl_context = SDL_GL_CreateContext(window);
  if (!gl_context) {
    probe_log("SDL_GL_CreateContext failed: %s", SDL_GetError());
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 12;
  }

  SDL_GL_SetSwapInterval(1);
  probe_log("GLES vendor=%s renderer=%s version=%s",
            (const char*)glGetString(GL_VENDOR),
            (const char*)glGetString(GL_RENDERER),
            (const char*)glGetString(GL_VERSION));

  const char* exported_window =
      SDL_webOSCreateExportedWindow(SDL_WEBOS_EXPORED_WINDOW_TYPE_VIDEO);
  probe_log("exported-video-window=%s",
            exported_window ? exported_window : "unavailable");
  probe_player_api();

  bool running = true;
  Uint32 frame = 0;
  while (running) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_KEYDOWN || event.type == SDL_KEYUP) {
        probe_log("event=%s scancode=%d keycode=%d repeat=%u",
                  event_name(event.type), (int)event.key.keysym.scancode,
                  (int)event.key.keysym.sym, event.key.repeat);
        if (event.type == SDL_KEYDOWN && should_quit_for_key(&event.key)) {
          running = false;
        }
      } else if (event.type == SDL_MOUSEMOTION) {
        probe_log("event=%s x=%d y=%d", event_name(event.type),
                  event.motion.x, event.motion.y);
      } else if (event.type == SDL_MOUSEBUTTONDOWN ||
                 event.type == SDL_MOUSEBUTTONUP) {
        probe_log("event=%s button=%u x=%d y=%d", event_name(event.type),
                  event.button.button, event.button.x, event.button.y);
      } else if (event.type == SDL_QUIT ||
                 event.type == SDL_APP_TERMINATING) {
        probe_log("event=%s", event_name(event.type));
        running = false;
      } else if (event.type >= SDL_APP_LOWMEMORY &&
                 event.type <= SDL_APP_DIDENTERFOREGROUND) {
        probe_log("event=%s", event_name(event.type));
      }
    }

    const float phase = (float)(frame % 600) / 600.0f;
    glViewport(0, 0, panel_width > 0 ? panel_width : 1920,
               panel_height > 0 ? panel_height : 1080);
    glClearColor(0.02f + phase * 0.08f, 0.08f, 0.16f - phase * 0.06f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    SDL_GL_SwapWindow(window);
    ++frame;
    SDL_Delay(16);
  }

  if (exported_window) {
    SDL_webOSDestroyExportedWindow(exported_window);
  }
  SDL_GL_DeleteContext(gl_context);
  SDL_DestroyWindow(window);
  SDL_Quit();
  probe_log("probe stopped cleanly");
  if (log_file) {
    fclose(log_file);
  }
  return 0;
}
