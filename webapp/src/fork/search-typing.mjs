// Typing into the search bar from a keyboard (physical, or webos-webui's
// virtual one). Pure core — the DOM side (focus path, synthetic keys, timers)
// is injected by index.js, so `node webapp/src/fork/test.mjs` covers it.
//
// Why this exists: the 2026 home layout puts YouTube's search bar on the home
// page, and focus reaches it on the voice-mic button. Letters typed there, or
// on the search text box before its keyboard is opened, are dropped — only the
// on-screen search keyboard's keys accept them (measured on lg75, debug 2.0.5,
// 2026-10-06; same on the search page when focus is still on the mic). A
// remote user opens it with Right + OK; a keyboard user has no reason to know
// that. So the first typing key in the bar is held, the bar is driven the way
// the remote would (Right to the box if on the mic, OK to open, or Down into
// an already open keyboard), and the held keys are replayed once focus is on
// the keyboard. YouTube acts on synthetic keydowns from page JS (verified
// live: Right, Enter and letters all work, `keyCode` from the init dict).
import { originalOf } from './keyboard-layout.mjs';

// Keys that type a character: space, digits, letters, numpad digits, and the
// OEM punctuation range (where the layout tables put æ ø å and friends).
export function isTypingKey(keyCode) {
  return (
    keyCode === 32 ||
    (keyCode >= 48 && keyCode <= 57) ||
    (keyCode >= 65 && keyCode <= 90) ||
    (keyCode >= 96 && keyCode <= 105) ||
    (keyCode >= 186 && keyCode <= 192) ||
    (keyCode >= 219 && keyCode <= 222)
  );
}

const RIGHT = 39;
const DOWN = 40;
const ENTER = 13;
const POLL_MS = 50;
const GIVE_UP_POLLS = 40; // 2 s: the keyboard took ~120 ms to take focus

// deps:
//   focusPath()       upper-case tag names from the focused element upward
//   keyboardOpen()    whether the on-screen search keyboard exists
//   send(code, init)  dispatch keydown+keyup (init: key/shiftKey/altKey),
//                     marked so onKey lets it through
//   later(fn, ms)     setTimeout
// Returns onKey(evt) -> true when the event was taken (caller swallows it).
export function createSearchTyping(deps) {
  let held = null; // keys typed while the bar is being opened

  function onKeyboard(path) {
    return path[0] === 'YT-KEYBOARD-KEY' || path.indexOf('YTLR-SEARCH-KEYBOARD') !== -1;
  }

  function waitFor(test, then, polls) {
    if (test(deps.focusPath())) return then();
    if (polls >= GIVE_UP_POLLS) {
      held = null; // fail open: the bar did not open, drop rather than wedge
      return undefined;
    }
    deps.later(() => waitFor(test, then, polls + 1), POLL_MS);
    return undefined;
  }

  function replay() {
    const keys = held;
    held = null;
    keys.forEach((k) => deps.send(k.keyCode, { key: k.key, shiftKey: k.shiftKey, altKey: k.altKey }));
  }

  function press(code) {
    deps.send(code, {});
    waitFor(onKeyboard, replay, 0);
  }

  function open(path) {
    if (deps.keyboardOpen()) {
      press(DOWN);
    } else if (path[0] === 'YTLR-SEARCH-VOICE-MIC-BUTTON') {
      deps.send(RIGHT, {});
      waitFor((p) => p[0] === 'YTLR-TEXT-BOX', () => press(ENTER), 0);
    } else {
      press(ENTER);
    }
  }

  return function onKey(evt) {
    // YouTube's own re-dispatched copies (see inheritOriginal) and our replays pass
    if (evt.ytafReplay || originalOf(evt) || evt.ctrlKey || evt.metaKey) return false;
    const code = evt.keyCode || evt.which || 0;
    if (!isTypingKey(code)) return false;
    if (held) {
      if (evt.type === 'keydown') {
        held.push({ keyCode: code, key: evt.key, shiftKey: !!evt.shiftKey, altKey: !!evt.altKey });
      }
      return true;
    }
    if (evt.type !== 'keydown') return false;
    const path = deps.focusPath();
    if (path.indexOf('YTLR-SEARCH-BAR') === -1) return false;
    held = [{ keyCode: code, key: evt.key, shiftKey: !!evt.shiftKey, altKey: !!evt.altKey }];
    open(path);
    return true;
  };
}
