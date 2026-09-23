#include <time.h>

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include <limits.h>
#include <unistd.h>

#include "starboard/configuration.h"
#include "starboard/shared/signal/crash_signals.h"
#include "starboard/shared/signal/debug_signals.h"
#include "starboard/shared/signal/suspend_signals.h"
#include "starboard/shared/starboard/link_receiver.h"
#include "starboard/webos/arm/application_sdl.h"

extern "C" SB_EXPORT_PLATFORM int main(int argc, char** argv) {
  // webOS exposes its system PulseAudio server here.  XDG_RUNTIME_DIR points
  // at the compositor runtime owned by root, so libpulse cannot discover the
  // socket automatically and would otherwise fall back to the incompatible
  // raw ALSA device.
  setenv("PULSE_SERVER", "unix:/var/run/pulse/native", 1);

  const char* log_path = "/tmp/cobalt-starterless.log";
  FILE* stdout_log = std::freopen(log_path, "a", stdout);
  FILE* stderr_log = std::freopen(log_path, "a", stderr);
  if (stdout_log) {
    std::setvbuf(stdout_log, nullptr, _IOLBF, 0);
  }
  if (stderr_log) {
    // Cobalt 23 logs unsupported modern YouTube selectors in large bursts.
    // Buffer those diagnostics so thousands of small writes cannot starve the
    // real-time PulseAudio thread during playback startup.
    std::setvbuf(stderr_log, nullptr, _IOFBF, 256 * 1024);
  }
  std::fprintf(stderr, "\n=== Cobalt starterless process started ===\n");

  tzset();
  starboard::shared::signal::InstallCrashSignalHandlers();
  starboard::shared::signal::InstallDebugSignalHandlers();
  starboard::shared::signal::InstallSuspendSignalHandlers();

  starboard::shared::webos::ApplicationSdl application;
  std::vector<char*> cobalt_argv;
  cobalt_argv.push_back(argv[0]);
  bool preload = false;
  for (int i = 1; i < argc; ++i) {
    if (argv[i] && argv[i][0] == '{' &&
        std::strstr(argv[i], "\"@system_native_app\"") != nullptr) {
      if (std::strstr(argv[i], "\"preload\":\"semi-full\"") != nullptr ||
          std::strstr(argv[i], "\"event\":\"preload\"") != nullptr) {
        preload = true;
      }
      continue;
    }
    cobalt_argv.push_back(argv[i]);
  }
  // fork: a debug package ships a `switches` file beside the binary, one
  // Cobalt switch per line like the 1.x starter's, so a normal launch opens
  // devtools for tools/tv-*.sh. Release packages carry no such file.
  std::vector<std::string> file_switches;
  char exe_path[PATH_MAX];
  const ssize_t exe_length = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
  if (exe_length > 0) {
    exe_path[exe_length] = '\0';
    std::string switches_path(exe_path);
    switches_path = switches_path.substr(0, switches_path.rfind('/') + 1) + "switches";
    std::ifstream switches_file(switches_path);
    std::string line;
    while (std::getline(switches_file, line)) {
      const size_t first = line.find_first_not_of(" \t\r");
      if (first == std::string::npos) continue;
      file_switches.push_back(line.substr(first, line.find_last_not_of(" \t\r") - first + 1));
    }
  }
  for (std::string& file_switch : file_switches) {
    std::fprintf(stderr, "Switch from package file: %s\n", file_switch.c_str());
    cobalt_argv.push_back(&file_switch[0]);
  }
  char preload_switch[] = "--preload";
  if (preload) {
    cobalt_argv.push_back(preload_switch);
    std::fprintf(stderr, "Translating webOS hidden preload launch.\n");
  }
  int result = 0;
  {
    starboard::shared::starboard::LinkReceiver receiver(&application);
    result = application.Run(static_cast<int>(cobalt_argv.size()),
                             cobalt_argv.data());
  }

  starboard::shared::signal::UninstallSuspendSignalHandlers();
  starboard::shared::signal::UninstallDebugSignalHandlers();
  starboard::shared::signal::UninstallCrashSignalHandlers();
  return result;
}
