#!/usr/bin/env python3
"""Generate webapp/src/fork/keyboard-layouts.mjs from the system's
xkeyboard-config, through libxkbcommon over ctypes (no headers or bindings
needed — just libxkbcommon.so.0 and /usr/share/X11/xkb).

Each layout is stored as the keys that differ from US, keyed by the Cobalt
virtual-key code LG's starter emits for that physical key position, with the
characters at [base, shift, altgr]. Keys equal to US are omitted, so the app
leaves Cobalt's own (US) `event.key` alone for them. Dead keys become their
standalone accent character (´ ` ^ ¨ ~ …) — the app cannot compose.

Usage: tools/gen-keyboard-layouts.py > webapp/src/fork/keyboard-layouts.mjs
"""
import ctypes
import json
import sys

# id -> (xkb layout, variant, display name). Variants prefer *nodeadkeys*.
LAYOUTS = [
    ('us', 'us', '', 'English (US)'),
    ('gb', 'gb', '', 'English (UK)'),
    ('dk', 'dk', 'nodeadkeys', 'Danish'),
    ('no', 'no', 'nodeadkeys', 'Norwegian'),
    ('se', 'se', 'nodeadkeys', 'Swedish'),
    ('fi', 'fi', 'nodeadkeys', 'Finnish'),
    ('is', 'is', '', 'Icelandic'),
    ('de', 'de', 'nodeadkeys', 'German'),
    ('ch', 'ch', 'de_nodeadkeys', 'Swiss German'),
    ('ch_fr', 'ch', 'fr_nodeadkeys', 'Swiss French'),
    ('fr', 'fr', 'nodeadkeys', 'French'),
    ('be', 'be', 'nodeadkeys', 'Belgian'),
    ('it', 'it', 'nodeadkeys', 'Italian'),
    ('es', 'es', 'nodeadkeys', 'Spanish'),
    ('latam', 'latam', 'nodeadkeys', 'Spanish (Latin America)'),
    ('pt', 'pt', 'nodeadkeys', 'Portuguese'),
    ('br', 'br', 'nodeadkeys', 'Portuguese (Brazil)'),
    ('pl', 'pl', '', 'Polish'),
    ('cz', 'cz', '', 'Czech'),
    ('sk', 'sk', '', 'Slovak'),
    ('hu', 'hu', '', 'Hungarian'),
    ('ro', 'ro', '', 'Romanian'),
    ('hr', 'hr', '', 'Croatian'),
    ('si', 'si', '', 'Slovenian'),
    ('ba', 'ba', '', 'Bosnian'),
    ('rs', 'rs', 'latin', 'Serbian (Latin)'),
    ('ee', 'ee', 'nodeadkeys', 'Estonian'),
    ('lv', 'lv', '', 'Latvian'),
    ('lt', 'lt', '', 'Lithuanian'),
    ('tr', 'tr', '', 'Turkish'),
    ('al', 'al', '', 'Albanian'),
    ('jp', 'jp', '', 'Japanese'),
]

# evdev keycode -> Cobalt/Windows virtual-key code, as LG's starter maps them
# with --enable_keyboard (table extracted 2026-09-02). The ISO 102nd key is
# not in the starter's table, so it is not here either.
EVDEV_TO_VK = {
    12: 0xBD, 13: 0xBB, 26: 0xDB, 27: 0xDD, 39: 0xBA, 40: 0xDE,
    41: 0xC0, 43: 0xDC, 51: 0xBC, 52: 0xBE, 53: 0xBF, 57: 0x20,
}
for code, digit in zip(range(2, 12), '1234567890'):
    EVDEV_TO_VK[code] = ord(digit)
for code, letter in zip(
    [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 36, 37,
     38, 44, 45, 46, 47, 48, 49, 50], 'QWERTYUIOPASDFGHJKLZXCVBNM'):
    EVDEV_TO_VK[code] = ord(letter)

lib = ctypes.CDLL('libxkbcommon.so.0')


class RuleNames(ctypes.Structure):
    _fields_ = [(n, ctypes.c_char_p) for n in ('rules', 'model', 'layout', 'variant', 'options')]


lib.xkb_context_new.restype = ctypes.c_void_p
lib.xkb_keymap_new_from_names.restype = ctypes.c_void_p
lib.xkb_keymap_new_from_names.argtypes = [ctypes.c_void_p, ctypes.POINTER(RuleNames), ctypes.c_int]
lib.xkb_keymap_num_levels_for_key.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint]
lib.xkb_keymap_key_get_syms_by_level.argtypes = [
    ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint,
    ctypes.POINTER(ctypes.POINTER(ctypes.c_uint))]
lib.xkb_keysym_to_utf8.argtypes = [ctypes.c_uint, ctypes.c_char_p, ctypes.c_size_t]
lib.xkb_keysym_get_name.argtypes = [ctypes.c_uint, ctypes.c_char_p, ctypes.c_size_t]
lib.xkb_keysym_from_name.argtypes = [ctypes.c_char_p, ctypes.c_int]
lib.xkb_keysym_from_name.restype = ctypes.c_uint

ctx = lib.xkb_context_new(0)


def keysym_char(sym):
    buf = ctypes.create_string_buffer(8)
    lib.xkb_keysym_to_utf8(sym, buf, 8)
    text = buf.value.decode()
    if text:
        return text
    name = ctypes.create_string_buffer(64)
    lib.xkb_keysym_get_name(sym, name, 64)
    name = name.value.decode()
    if name.startswith('dead_'):  # dead_acute -> acute -> '´'
        plain = lib.xkb_keysym_from_name(name[5:].encode(), 0)
        if plain:
            lib.xkb_keysym_to_utf8(plain, buf, 8)
            return buf.value.decode()
    return ''


def table(layout, variant):
    names = RuleNames(b'evdev', b'pc105', layout.encode(), variant.encode(), None)
    keymap = lib.xkb_keymap_new_from_names(ctx, ctypes.byref(names), 0)
    if not keymap:
        sys.exit(f'xkb has no layout {layout}({variant})')
    out = {}
    for code, vk in EVDEV_TO_VK.items():
        keycode = code + 8
        levels = lib.xkb_keymap_num_levels_for_key(keymap, keycode, 0)
        chars = []
        for level in range(3):
            syms = ctypes.POINTER(ctypes.c_uint)()
            n = lib.xkb_keymap_key_get_syms_by_level(keymap, keycode, 0, level, ctypes.byref(syms)) if level < levels else 0
            chars.append(keysym_char(syms[0]) if n else '')
        out[vk] = chars
    return out


us = table('us', '')
layouts, names = {}, {}
for lid, layout, variant, name in LAYOUTS:
    full = table(layout, variant)
    layouts[lid] = {str(vk): chars for vk, chars in full.items() if chars != us[vk]}
    names[lid] = name

print('// GENERATED by tools/gen-keyboard-layouts.py from xkeyboard-config — do not edit.')
print('// Per layout: Cobalt keyCode -> [base, shift, altgr] for keys that differ from US.')
print('export const LAYOUT_NAMES = ' + json.dumps(names, ensure_ascii=False, indent=2) + ';')
print('export const LAYOUTS = ' + json.dumps(layouts, ensure_ascii=False, separators=(',', ':')) + ';')
