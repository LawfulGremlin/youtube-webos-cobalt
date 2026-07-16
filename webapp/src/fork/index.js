// Fork-owned feature module (see FORK.md). The single `import './fork/index.js'`
// in adblock-main.js is the only wiring in upstream files — everything else
// lives under webapp/src/fork/ so upstream syncs merge cleanly.

import { configRead, configWrite } from '../config.js';
import { checkboxTools } from '../checkboxTools.js';
import { showNotification } from '../ui.js';
import { filterTvResponse, getUnmatchedShoppingKeys } from './filters.mjs';
import { stepTarget } from './frame-step.mjs';
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

const FORK_DEFAULTS = {
  forkRemoveShorts: false
};
SLOTS.forEach((slot) => {
  FORK_DEFAULTS[bindingConfigKey(slot.id)] = 'none';
});
FORK_DEFAULTS[bindingConfigKey('red')] = 'frame_step_back';
FORK_DEFAULTS[bindingConfigKey('blue')] = 'frame_step_fwd';

// Seed fork-only keys: upstream's defaultConfig doesn't know them, so an
// unseeded configRead would return undefined forever.
Object.keys(FORK_DEFAULTS).forEach((key) => {
  if (typeof configRead(key) === 'undefined') {
    configWrite(key, FORK_DEFAULTS[key]);
  }
});

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

// fork: the in-video shopping/merch overlay's exact TV renderer name is
// unconfirmed (the TV was off when it was reported, and it only appears
// mid-playback). SHOPPING_RENDERER_KEYS is a best guess; this exposes whatever
// shopping-shaped keys it did NOT match, so `window.ytafShoppingKeys()` over
// the debug build's CDP names the real one instead of another guessing round.
window.ytafShoppingKeys = getUnmatchedShoppingKeys;

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

// --- Key dispatch ------------------------------------------------------------

function isWatchContext() {
  return /[?&#]v=/.test(String(window.location.href) + String(window.location.hash));
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
