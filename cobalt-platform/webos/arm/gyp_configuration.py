"""Starboard webOS ARM platform configuration."""

from starboard.linux.shared import gyp_configuration as shared_configuration


class WebOsArmConfiguration(shared_configuration.LinuxConfiguration):
  pass


def CreatePlatformConfig():
  return WebOsArmConfiguration('webos-arm')
