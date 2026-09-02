// Keyboard layout for physical and virtual keyboards. Pure core — no DOM, no
// config imports — so `node webapp/src/fork/test.mjs` covers it; the event
// hook, the once-only decision and the settings row live in index.js.
//
// Why this exists: LG's Cobalt starter (with --enable_keyboard, see the
// Makefile) hands the page US virtual-key codes, and Cobalt derives
// `event.key` from them with a US table. YouTube's search box types
// `event.key` for any keydown whose keyCode is a known typing key (measured
// 2026-09-02), so rewriting `key` per layout is all a layout needs.
import { LAYOUTS, LAYOUT_NAMES } from './keyboard-layouts.mjs';

export const LAYOUT_IDS = Object.keys(LAYOUTS);

// Country (YouTube's ytcfg GL, ISO 3166-1 alpha-2) -> layout id. Source:
// Microsoft, "Default input profiles (input locales) in Windows"
// (learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/
// default-input-locales-for-windows-language-packs, 2024-08-30), whose
// per-locale defaults name the physical layout each country ships with.
// Countries whose standard layout is non-Latin (RU, GR, IL, BG, TH, KR, CN …)
// carry US as their secondary profile and US QWERTY as the Latin level of
// their keyboards, so they take the us fallback like every unlisted country.
const COUNTRY_GROUPS = {
  us: 'US CA AU NZ SG ZA HK MY PH ID IN NL',
  gb: 'GB IE MT',
  dk: 'DK GL FO',
  no: 'NO SJ',
  se: 'SE',
  fi: 'FI AX',
  is: 'IS',
  de: 'DE AT',
  ch: 'CH LI',
  ch_fr: 'LU',
  fr: 'FR MC',
  be: 'BE',
  it: 'IT SM VA',
  es: 'ES',
  latam: 'MX AR CL CO PE VE EC UY PY BO CR PA GT HN SV NI DO CU PR',
  pt: 'PT AO MZ CV GW ST TL MO',
  br: 'BR',
  pl: 'PL',
  cz: 'CZ',
  sk: 'SK',
  hu: 'HU',
  ro: 'RO MD',
  hr: 'HR',
  si: 'SI',
  ba: 'BA',
  rs: 'RS ME',
  ee: 'EE',
  lv: 'LV',
  lt: 'LT',
  tr: 'TR',
  al: 'AL',
  jp: 'JP'
};

const COUNTRY_LAYOUT = {};
Object.keys(COUNTRY_GROUPS).forEach((layout) => {
  COUNTRY_GROUPS[layout].split(' ').forEach((country) => {
    COUNTRY_LAYOUT[country] = layout;
  });
});

export function layoutForCountry(country) {
  return COUNTRY_LAYOUT[String(country || '').toUpperCase()] || 'us';
}

// The automatic decision happens once: a stored layout is never revisited,
// and without a country there is no decision yet ('' = undecided, behaves as
// US until the next launch). A stored id this build no longer knows counts
// as undecided so a removed layout can't strand a device.
export function decideLayout(current, country) {
  if (current && LAYOUTS[current]) return current;
  if (!country) return '';
  return layoutForCountry(country);
}

// The character the layout puts on this key at this level, or null when the
// layout agrees with US (leave Cobalt's own event.key alone). AltGr wins
// over Shift: the tables hold [base, shift, altgr] only.
export function layoutKey(layoutId, keyCode, shift, altgr) {
  const table = LAYOUTS[layoutId];
  if (!table) return null;
  const levels = table[String(keyCode)];
  if (!levels) return null;
  return levels[altgr ? 2 : shift ? 1 : 0] || null;
}

export function layoutLabel(layoutId) {
  return LAYOUT_NAMES[layoutId] || layoutId || 'undecided';
}

// Settings-row cycling, same contract as cycleActionKey.
export function cycleLayout(current, delta) {
  const idx = LAYOUT_IDS.indexOf(current);
  const from = idx === -1 ? 0 : idx;
  return LAYOUT_IDS[(from + delta + LAYOUT_IDS.length) % LAYOUT_IDS.length];
}
