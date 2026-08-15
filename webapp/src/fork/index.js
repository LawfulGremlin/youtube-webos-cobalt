// Fork-owned feature module (see FORK.md). The single `import './fork/index.js'`
// in adblock-main.js is the only wiring in upstream files — everything else
// lives under webapp/src/fork/ so upstream syncs merge cleanly.

import { configRead, configWrite } from '../config.js';
import './fork.css';
import { checkboxTools } from '../checkboxTools.js';
import { showNotification } from '../ui.js';
import { text as languageText } from '../languages/index.js';
import { toggleSubtitles } from '../subtitle-shortcut.js';
import { filterTvResponse, getUnmatchedShoppingKeys } from './filters.mjs';
import { stepTarget } from './frame-step.mjs';
import { nextPlaybackRate } from './playback-speed.mjs';
import {
  SLOTS,
  registerShortcutAction,
  getAction,
  slotForKeyCode,
  cycleActionKey
} from './shortcut-registry.mjs';

function bindingConfigKey(slotId) {
  return 'forkShortcut_' + slotId;
}

// Default slot bindings, laid out as back/forward pairs on the number pad.
// Slots not listed default to 'none', which releases the key to the TV app —
// that includes all three colour buttons.
//
//   0      subtitles on/off           (matches upstream's hardwired digit 0)
//   1 / 3  playback speed down / up   (matches upstream's hardwired digits)
//   4 / 6  skip 15 frames back / forward
//   7 / 9  step 1 frame back / forward
const SLOT_DEFAULTS = {
  key_0: 'subtitles_toggle',
  key_1: 'playback_speed_down',
  key_3: 'playback_speed_up',
  key_4: 'frame_skip_back',
  key_6: 'frame_skip_fwd',
  key_7: 'frame_step_back',
  key_9: 'frame_step_fwd'
};

// Bump whenever SLOT_DEFAULTS changes — and also whenever the meaning of this
// block changes, which is why v4 is skipped. A build that stamped v4 while
// this code still tried to MIGRATE bindings left devices marked done, so they
// would never see the reset that replaced it. Reusing a version number after
// changing what it does silently strands every device already carrying it.
//
// ponytail: a full reset, deliberately. Preserving custom bindings means
// telling "untouched" from "deliberately set to 'none'", and 'none' is a real
// binding here (it frees the key for the TV app), so the stored value alone
// can't distinguish them — that ambiguity produced two separate clobbering
// bugs. Per-version bookkeeping fixes it but is a lot of machinery for a
// setting that changes about once a release, and the maintainer signed off on
// resetting instead. If bindings ever need to survive a bump, record the
// defaults in force at each version and compare against the version the config
// was written at — not against the values alone.
const SHORTCUT_DEFAULTS_VERSION = 6;

const FORK_DEFAULTS = {
  forkRemoveShorts: false
};
SLOTS.forEach((slot) => {
  FORK_DEFAULTS[bindingConfigKey(slot.id)] = SLOT_DEFAULTS[slot.id] || 'none';
});

// Seed fork-only keys: upstream's defaultConfig doesn't know them, so an
// unseeded configRead would return undefined forever.
Object.keys(FORK_DEFAULTS).forEach((key) => {
  if (typeof configRead(key) === 'undefined') {
    configWrite(key, FORK_DEFAULTS[key]);
  }
});

if ((configRead('forkShortcutDefaultsVersion') || 0) < SHORTCUT_DEFAULTS_VERSION) {
  SLOTS.forEach((slot) => {
    const key = bindingConfigKey(slot.id);
    configWrite(key, FORK_DEFAULTS[key]);
  });
  configWrite('forkShortcutDefaultsVersion', SHORTCUT_DEFAULTS_VERSION);
}

// Chain onto JSON.parse after upstream adblock.js — same interception point
// upstream uses, without editing upstream code. Shorts filtering is behind
// our own toggle; feed-ad item removal rides the existing adblock toggle.
const prevParse = JSON.parse;
JSON.parse = function () {
  const result = prevParse.apply(this, arguments);
  try {
    const removed = filterTvResponse(result, {
      removeAds: configRead('enableAdBlock'),
      removeShorts: configRead('forkRemoveShorts')
    });
    if (removed) {
      console.info('[ytaf-fork] filtered ' + removed + ' feed item(s)');
    }
  } catch (err) {
    console.warn('[ytaf-fork] filter failed:', err);
  }
  return result;
};

// fork: an XHR responseText-shadow feed filter used to live here. Removed
// 2026-08-15 as measured dead code: instrumenting XMLHttpRequest.open on
// hardware showed 0 of 73 requests hitting the /youtubei/v1/(browse|search|
// next|reel) endpoints it scoped — this client fetches its feed through some
// other transport, so the shadow never filtered anything. Feed-ad and Shorts
// removal ride upstream's DOM hider plus the JSON.parse chain above for
// whatever payloads do pass through it.

// fork: belt-and-braces for the in-video shopping QR card. The JSON filter above
// keys off shoppingTimelyActionRenderer, which is *inferred* from the DOM tag
// (ytlr-shopping-timely-action-renderer) via this client's tag↔renderer naming
// convention — the element names are confirmed live, the InnerTube key isn't.
// fork.css keys off the confirmed element name instead; this gates it on the
// AdBlock toggle. If the JSON key is right, the rule never has anything to hide.
function syncShoppingCardHiding() {
  const root = document.documentElement;
  if (!root) return;
  if (configRead('enableAdBlock')) {
    root.classList.add('ytaf-hide-shopping');
  } else {
    root.classList.remove('ytaf-hide-shopping');
  }
}
syncShoppingCardHiding();

// The JSON filter above re-reads the toggle on every parse, so it follows the
// setting for free — this class doesn't, and syncing it only at import would
// leave the card hidden (or showing) until the next launch. configWrite emits
// this event for exactly that.
document.addEventListener('ytaf-config-changed', (evt) => {
  const key = evt && evt.detail && evt.detail.key;
  if (!key || key === 'enableAdBlock') syncShoppingCardHiding();
});

// fork: SHOPPING_RENDERER_KEYS above is inferred, not confirmed. This exposes
// any shopping-shaped key it did NOT match, so `window.ytafShoppingKeys()` over
// the debug build's CDP names the real one from real data if the inference is
// wrong — rather than another round of guessing.
window.ytafShoppingKeys = getUnmatchedShoppingKeys;
window.ytafSyncShoppingCardHiding = syncShoppingCardHiding;

// --- Shortcut actions -------------------------------------------------------

// Frame stepping, ported from LawfulGremlin/youtube-webos fork-extensions.
function performFrameStep(frames) {
  const video = document.querySelector('video');
  if (!video || !isFinite(video.currentTime)) return;
  if (!video.paused) video.pause();
  video.currentTime = stepTarget(video.currentTime, video.duration, frames);
  const abs = Math.abs(frames);
  const suffix = abs !== 1 ? 's' : '';
  showNotification(
    frames > 0 ? '►| +' + abs + ' Frame' + suffix : '|◄ -' + abs + ' Frame' + suffix,
    1000
  );
}

registerShortcutAction({ key: 'frame_step_fwd', label: 'Frame Step Forward', scope: 'VIDEO', handler: () => performFrameStep(1), burst: true });
registerShortcutAction({ key: 'frame_step_back', label: 'Frame Step Backward', scope: 'VIDEO', handler: () => performFrameStep(-1), burst: true });
registerShortcutAction({ key: 'frame_skip_fwd', label: 'Skip 15 Frames Forward', scope: 'VIDEO', handler: () => performFrameStep(15), burst: true });
registerShortcutAction({ key: 'frame_skip_back', label: 'Skip 15 Frames Backward', scope: 'VIDEO', handler: () => performFrameStep(-15), burst: true });

// Playback speed. Upstream's ui.js version is not taken — see playback-speed.mjs.
function adjustPlaybackRate(direction) {
  const video = document.querySelector('video');
  if (!video) return;
  const next = nextPlaybackRate(video.playbackRate, direction);
  if (next === Number(video.playbackRate)) return;
  video.playbackRate = next;
  showNotification('Playback speed: ' + next + 'x', 1800);
}

registerShortcutAction({ key: 'playback_speed_up', label: 'Playback Speed Up', scope: 'VIDEO', handler: () => adjustPlaybackRate(1), burst: true });
registerShortcutAction({ key: 'playback_speed_down', label: 'Playback Speed Down', scope: 'VIDEO', handler: () => adjustPlaybackRate(-1), burst: true });

// Subtitle toggle, upstream's subtitle-shortcut.js (v1.2.1). Upstream
// hardwires it to digit 0 in ui.js; per this fork's principle, upstream's
// hardcoded keys become registry actions with that key as the (rebindable,
// clearable) default — see SLOT_DEFAULTS. Reuses upstream's localized
// notification strings from languages/*.js.
function doToggleSubtitles() {
  toggleSubtitles((state) => {
    const messageKey = {
      on: 'subtitleOn',
      off: 'subtitleOff',
      unavailable: 'subtitleUnavailable'
    }[state];
    showNotification(languageText('ui', messageKey || 'subtitleUnavailable'), 1800);
  });
}

registerShortcutAction({ key: 'subtitles_toggle', label: 'Subtitles On/Off', scope: 'VIDEO', handler: doToggleSubtitles, burst: false });

// --- Key dispatch ------------------------------------------------------------

function isWatchContext() {
  // Shorts pages carry no v= in the URL; upstream's equivalent gate
  // (isPlayerPage) accepts them via the body class, so ours does too.
  return (
    /[?&#]v=/.test(String(window.location.href) + String(window.location.hash)) ||
    Boolean(
      document.body && document.body.classList.contains('WEB_PAGE_TYPE_SHORTS')
    )
  );
}

function isMenuOpen() {
  const menu = document.querySelector('.ytaf-ui-container');
  return Boolean(menu && menu.style.display !== 'none');
}

// fork: navigation-checkbox.js installs a global window.navigate(dir) as a
// polyfill for native browser-engine spatial navigation — nothing in this
// codebase calls it, so if it exists, only the platform itself is calling
// it. Whether that's real, and whether the platform re-reads window.navigate
// per call (so overwriting it here actually takes effect), is UNVERIFIED —
// hence this is a secondary mitigation, not the fix for the settings-menu
// row-skip bug. That fix is currentFocusIndex in ui.js's moveFocus(), which
// tracks its own position instead of re-deriving it from
// document.activeElement, so it can't inherit an extra step regardless of
// whether this wrap does anything. This block stays only in case
// window.navigate has other native side effects (sound, animation) worth
// suppressing while our menu is open; the logging lets a real hardware
// pass confirm whether it does anything at all.
console.info('[ytaf-fork] window.navigate at fork init: ' + typeof window.navigate);
if (typeof window.navigate === 'function') {
  const nativeNavigate = window.navigate;
  window.navigate = function () {
    if (isMenuOpen()) {
      console.info('[ytaf-fork] suppressed window.navigate (menu open)');
      return undefined;
    }
    return nativeNavigate.apply(this, arguments);
  };
  console.info('[ytaf-fork] wrapped window.navigate to suppress it while menu is open');
}

// ui.js's key handler is ALSO a capture listener on document, and
// stopPropagation() does not affect other listeners on the same node —
// only stopImmediatePropagation() does. Without it, left/right on a
// binding row would cycle the action AND move focus via ui.js.
function swallowEvent(evt) {
  evt.preventDefault();
  if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
  evt.stopPropagation();
}

// Binding rows in the settings menu: Enter/left/right cycle the focused
// slot's action. Registered at import time, which is before ui.js installs
// its document handlers, so this capture listener runs first for these keys
// while a binding row is focused; up/down fall through to ui.js focus
// movement.
function onMenuKey(evt) {
  if (!isMenuOpen()) return;
  const el = document.activeElement;
  if (!el || !el.dataset || !el.dataset.forkSlot) return;

  const key = evt.keyCode || evt.which || 0;
  let delta = 0;
  if (key === 13 || key === 32 || key === 39) delta = 1; // Enter/Space/right
  else if (key === 37) delta = -1; // left
  else return;

  swallowEvent(evt);

  const cfgKey = bindingConfigKey(el.dataset.forkSlot);
  configWrite(cfgKey, cycleActionKey(configRead(cfgKey), delta));
  if (el.__forkUpdateLabel) el.__forkUpdateLabel();
}
document.addEventListener('keydown', onMenuKey, true);

// Slot keys dispatch their bound action. Slots bound to 'none' fall through
// untouched so the TV app's own key handling is preserved.
function onShortcutKey(evt) {
  if (isMenuOpen()) return;

  const slot = slotForKeyCode(evt.keyCode || evt.which || 0);
  if (!slot) return;

  const action = getAction(configRead(bindingConfigKey(slot.id)));
  if (!action || !action.handler) return;
  if (action.scope === 'VIDEO' && !isWatchContext()) return;
  if (evt.repeat && !action.burst) return;

  swallowEvent(evt);
  action.handler();
}
document.addEventListener('keydown', onShortcutKey, true);

// --- Settings UI -------------------------------------------------------------

// Binding rows reuse the checkbox row styling (.toggler-wrapper +
// .ytaf-focused) but carry no id, so upstream's Enter-toggles-checkbox
// path ignores them; onMenuKey above handles their input instead.
let cyclerTabIndex = 900; // clear of checkboxTools' own tabindex counter
function bindingRow(slot) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('toggler-wrapper');

  const focusable = document.createElement('div');
  focusable.setAttribute('tabindex', cyclerTabIndex);
  cyclerTabIndex += 1;
  focusable.dataset.forkSlot = slot.id;

  const label = document.createElement('div');
  label.classList.add('desc');
  focusable.__forkUpdateLabel = function () {
    const action = getAction(configRead(bindingConfigKey(slot.id))) || getAction('none');
    label.textContent = slot.label + ': ' + action.label;
  };
  focusable.__forkUpdateLabel();

  focusable.addEventListener('focus', () => wrapper.classList.add('ytaf-focused'));
  focusable.addEventListener('blur', () => wrapper.classList.remove('ytaf-focused'));

  wrapper.appendChild(focusable);
  wrapper.appendChild(label);
  return wrapper;
}

// Append our rows once upstream's settings UI exists. The container is
// built when startUserScript() runs, which is after module import time.
let uiTries = 0;
function appendForkUI() {
  const container = document.querySelector('.ytaf-ui-container');
  if (!container) {
    uiTries += 1;
    if (uiTries < 120) setTimeout(appendForkUI, 500);
    return;
  }
  container.appendChild(
    checkboxTools.add(
      '__fork_remove_shorts',
      'Remove Shorts',
      configRead('forkRemoveShorts'),
      (state) => configWrite('forkRemoveShorts', state)
    )
  );

  const shortcuts = document.createElement('div');
  shortcuts.classList.add('blockquote');
  SLOTS.forEach((slot) => shortcuts.appendChild(bindingRow(slot)));
  container.appendChild(shortcuts);
}
appendForkUI();
