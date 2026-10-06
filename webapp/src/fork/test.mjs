// Self-test for the fork filters: `node webapp/src/fork/test.mjs`.
// Plain node + assert — no framework, mirrors upstream's zero-test-infra style.

import assert from 'node:assert/strict';
import { filterTvResponse } from './filters.mjs';
import { stepTarget, FRAME_DURATION_SEC } from './frame-step.mjs';
import { nextPlaybackRate, PLAYBACK_RATES } from './playback-speed.mjs';
import {
  LAYOUT_IDS,
  layoutForCountry,
  decideLayout,
  layoutKey,
  inheritOriginal,
  layoutLabel,
  cycleLayout
} from './keyboard-layout.mjs';
import { LAYOUTS } from './keyboard-layouts.mjs';
import { isTypingKey, createSearchTyping } from './search-typing.mjs';
import {
  SLOTS,
  registerShortcutAction,
  getAction,
  slotForKeyCode,
  cycleActionKey
} from './shortcut-registry.mjs';

const ADS = { removeAds: true };

function feed(...items) {
  return {
    contents: {
      tvBrowseRenderer: {
        content: {
          tvSurfaceContentRenderer: {
            content: { sectionListRenderer: { contents: [...items] } }
          }
        }
      }
    }
  };
}

const normalTile = () => ({
  tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT', contentType: 'TILE_CONTENT_TYPE_VIDEO' }
});

function feedItems(data) {
  return data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content
    .sectionListRenderer.contents;
}

// Feed ads: adSlotRenderer and reel ads go, the normal tile stays
{
  const data = feed(
    { adSlotRenderer: {} },
    { command: { reelWatchEndpoint: { adClientParams: { isAd: 'true' } } } },
    { command: { reelWatchEndpoint: { videoType: 'REEL_VIDEO_TYPE_AD' } } },
    normalTile()
  );
  assert.equal(filterTvResponse(data, ADS), 3);
  assert.equal(feedItems(data).length, 1);
}

// Nested: an ad inside a shelf's item list is removed, the shelf survives
{
  const shelf = {
    shelfRenderer: {
      content: { horizontalListRenderer: { items: [{ adSlotRenderer: {} }, normalTile()] } }
    }
  };
  const data = feed(shelf, normalTile());
  assert.equal(filterTvResponse(data, ADS), 1);
  assert.equal(feedItems(data).length, 2);
  assert.equal(shelf.shelfRenderer.content.horizontalListRenderer.items.length, 1);
}

// Shorts are upstream's job now (shorts-response-filter.mjs): untouched here
{
  const data = feed({ reelItemRenderer: {} }, { adSlotRenderer: {} });
  assert.equal(filterTvResponse(data, ADS), 1);
  assert.equal(feedItems(data).length, 1);
  assert.ok(feedItems(data)[0].reelItemRenderer);
}

// Flag off: untouched, returns 0
{
  const data = feed({ adSlotRenderer: {} });
  assert.equal(filterTvResponse(data, {}), 0);
  assert.equal(feedItems(data).length, 1);
}

// Garbage tolerance
assert.equal(filterTvResponse(null, ADS), 0);
assert.equal(filterTvResponse('"a string"', ADS), 0);
assert.equal(filterTvResponse([null, 42, 'x'], ADS), 0);
assert.equal(filterTvResponse({ a: { b: [null, { c: [] }] } }, ADS), 0);

// Shortcut registry: slot mapping (green 404/172 must NOT be a slot — it
// opens the settings menu)
assert.equal(SLOTS.length, 13); // red, yellow, blue, keys 0-9
assert.equal(slotForKeyCode(403).id, 'red');
assert.equal(slotForKeyCode(405).id, 'yellow');
assert.equal(slotForKeyCode(170).id, 'yellow');
assert.equal(slotForKeyCode(406).id, 'blue');
assert.equal(slotForKeyCode(191).id, 'blue');
assert.equal(slotForKeyCode(49).id, 'key_1');
assert.equal(slotForKeyCode(105).id, 'key_9');
assert.equal(slotForKeyCode(404), null);
assert.equal(slotForKeyCode(172), null);
assert.equal(slotForKeyCode(13), null);

// Shortcut registry: registration, validation, duplicates
assert.throws(() => registerShortcutAction({ key: 'x' }), /handler/);
registerShortcutAction({ key: 'act_a', label: 'A', handler: () => {} });
registerShortcutAction({ key: 'act_b', label: 'B', scope: 'GLOBAL', handler: () => {}, burst: true });
assert.throws(() => registerShortcutAction({ key: 'act_a', handler: () => {} }), /duplicate/);
assert.equal(getAction('act_a').scope, 'VIDEO'); // default scope
assert.equal(getAction('act_b').burst, true);
assert.equal(getAction('none').handler, null);
assert.equal(getAction('missing'), null);

// Shortcut registry: cycling wraps both ways and recovers stale bindings
assert.equal(cycleActionKey('none', 1), 'act_a');
assert.equal(cycleActionKey('act_a', 1), 'act_b');
assert.equal(cycleActionKey('act_b', 1), 'none');
assert.equal(cycleActionKey('none', -1), 'act_b');
assert.equal(cycleActionKey('deleted_action', 1), 'act_a'); // stale → treated as 'none'

// Frame step: normal stepping math
assert.ok(Math.abs(stepTarget(10, 100, 1) - (10 + FRAME_DURATION_SEC)) < 1e-9);
assert.ok(Math.abs(stepTarget(10, 100, -1) - (10 - FRAME_DURATION_SEC)) < 1e-9);

// Frame step: floor at 0, ceiling one frame short of the end (Cobalt restarts
// a video seeked to its exact end)
assert.equal(stepTarget(0, 100, -1), 0);
assert.equal(stepTarget(99.999, 100, 1), 100 - FRAME_DURATION_SEC);
assert.equal(stepTarget(100, 100, 1), 100 - FRAME_DURATION_SEC);

// Frame step: unknown duration (NaN while loading) must not block stepping
assert.ok(Math.abs(stepTarget(10, NaN, 1) - (10 + FRAME_DURATION_SEC)) < 1e-9);
assert.equal(stepTarget(0, undefined, -1), 0);

// Playback speed: steps one position, clamps at both ends, never wraps
assert.equal(nextPlaybackRate(1, 1), 1.25);
assert.equal(nextPlaybackRate(1, -1), 0.75);
assert.equal(nextPlaybackRate(PLAYBACK_RATES[PLAYBACK_RATES.length - 1], 1), 2);
assert.equal(nextPlaybackRate(PLAYBACK_RATES[0], -1), 0.25);

// Off-list rates snap to the nearest listed one, then step from there
assert.equal(nextPlaybackRate(1.3, 1), 1.5);
assert.equal(nextPlaybackRate(1.3, -1), 1);

// Garbage rates fall back to 1x rather than producing NaN
assert.equal(nextPlaybackRate(undefined, 1), 1.25);
assert.equal(nextPlaybackRate(0, 1), 1.25);
assert.equal(nextPlaybackRate(NaN, -1), 0.75);

// Colour keys as LG's magic remote delivers them with keyboard input enabled.
assert.equal(slotForKeyCode(166).id, 'red');
assert.equal(slotForKeyCode(170).id, 'yellow');
assert.equal(slotForKeyCode(167).id, 'blue');
assert.equal(slotForKeyCode(172), null, 'green stays upstream\'s settings-menu key');

// --- Keyboard layout ---------------------------------------------------------

// Country -> layout: the two named cases, the source's other groupings, and
// everything unknown or non-Latin falls back to us.
assert.equal(layoutForCountry('DK'), 'dk');
assert.equal(layoutForCountry('dk'), 'dk');
assert.equal(layoutForCountry('US'), 'us');
assert.equal(layoutForCountry('CA'), 'us');
assert.equal(layoutForCountry('NL'), 'us');
assert.equal(layoutForCountry('AT'), 'de');
assert.equal(layoutForCountry('LU'), 'ch_fr');
assert.equal(layoutForCountry('MX'), 'latam');
assert.equal(layoutForCountry('RU'), 'us');
assert.equal(layoutForCountry('GR'), 'us');
assert.equal(layoutForCountry(''), 'us');
assert.equal(layoutForCountry(undefined), 'us');
assert.equal(layoutForCountry('ZZ'), 'us');

// Every layout the country table points at exists in the generated data.
['us', 'gb', 'dk', 'no', 'se', 'fi', 'is', 'de', 'ch', 'ch_fr', 'fr', 'be', 'it', 'es',
  'latam', 'pt', 'br', 'pl', 'cz', 'sk', 'hu', 'ro', 'hr', 'si', 'ba', 'rs', 'ee', 'lv',
  'lt', 'tr', 'al', 'jp'].forEach((id) => assert.ok(LAYOUTS[id], 'missing layout ' + id));
assert.equal(LAYOUT_IDS[0], 'us');
assert.deepEqual(LAYOUTS.us, {}, 'us is the reference: nothing to override');

// Decided once: a stored layout is never revisited, no country means no
// decision yet, and a stale id is treated as undecided.
assert.equal(decideLayout('', 'DK'), 'dk');
assert.equal(decideLayout('us', 'DK'), 'us');
assert.equal(decideLayout('dk', 'US'), 'dk');
assert.equal(decideLayout('', undefined), '');
assert.equal(decideLayout('', ''), '');
assert.equal(decideLayout(undefined, ''), '');
assert.equal(decideLayout('nolongerexists', 'DK'), 'dk');
assert.equal(decideLayout('', 'ZZ'), 'us');

// Danish: the three letters at the US ; ' [ positions, Shift for capitals,
// AltGr level from the same table, letters untouched (null = leave US key).
assert.equal(layoutKey('dk', 186, false, false), 'æ');
assert.equal(layoutKey('dk', 186, true, false), 'Æ');
assert.equal(layoutKey('dk', 222, false, false), 'ø');
assert.equal(layoutKey('dk', 219, false, false), 'å');
assert.equal(layoutKey('dk', 219, true, false), 'Å');
assert.equal(layoutKey('dk', 50, false, false), '2', 'a key that differs on any level carries all three');
assert.equal(layoutKey('dk', 50, true, false), '"');
assert.equal(layoutKey('dk', 50, false, true), '@');
// Letters carry their AltGr level too, so they are in the table; base and
// shift still spell what Cobalt would have spelled.
assert.equal(layoutKey('dk', 65, false, false), 'a');
assert.equal(layoutKey('dk', 65, true, false), 'A');
assert.equal(layoutKey('dk', 0xBD, false, false), '+');
// US and undecided leave everything alone; unknown keys and layouts too.
assert.equal(layoutKey('us', 186, false, false), null);
assert.equal(layoutKey('', 186, false, false), null);
assert.equal(layoutKey('nolongerexists', 186, false, false), null);
assert.equal(layoutKey('dk', 999, false, false), null);
// German QWERTZ swaps Y and Z; Polish differs from US only on AltGr.
assert.equal(layoutKey('de', 89, false, false), 'z');
assert.equal(layoutKey('de', 90, true, false), 'Y');
assert.equal(layoutKey('pl', 65, false, false), 'a');
assert.equal(layoutKey('pl', 65, false, true), 'ą');
// YouTube's re-dispatched copies get the original's modifiers and key once;
// real events (which have shiftKey) and copies without an original are left.
{
  // the original sits under whatever name the minifier picked: he, then be
  for (const name of ['he', 'be', 'zQ']) {
    const copy = { keyCode: 67, DW: true, jN: undefined };
    copy[name] = { keyCode: 67, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, key: 'C' };
    assert.equal(inheritOriginal(copy), true, name);
    assert.equal(copy.shiftKey, true);
    assert.equal(copy.key, 'C');
    assert.equal(Object.keys(copy).includes('shiftKey'), true, 'own enumerable, for Closure\'s for-in wrapper');
    assert.equal(inheritOriginal(copy), false);
  }
  assert.equal(inheritOriginal({ keyCode: 67 }), false);
  assert.equal(inheritOriginal({ keyCode: 67, detail: { x: 1 } }), false); // an object, but no key event
  assert.equal(inheritOriginal({ keyCode: 67, shiftKey: false, be: { keyCode: 67, shiftKey: true } }), false);
}
// No dead keys survive generation: every stored character is printable text.
Object.keys(LAYOUTS).forEach((id) => {
  Object.keys(LAYOUTS[id]).forEach((code) => {
    const levels = LAYOUTS[id][code];
    assert.equal(levels.length, 3, id + '/' + code);
    levels.forEach((ch) => assert.ok(!/^<[a-z]|dead/.test(ch), id + '/' + code + ': ' + ch));
  });
});

// Settings row: labels and cycling that always recovers.
assert.equal(layoutLabel('dk'), 'Danish');
assert.equal(layoutLabel(''), 'undecided');
assert.equal(cycleLayout('us', 1), LAYOUT_IDS[1]);
assert.equal(cycleLayout(LAYOUT_IDS[LAYOUT_IDS.length - 1], 1), 'us');
assert.equal(cycleLayout('us', -1), LAYOUT_IDS[LAYOUT_IDS.length - 1]);
assert.equal(cycleLayout('', 1), LAYOUT_IDS[1]);
assert.equal(cycleLayout('bogus', 1), LAYOUT_IDS[1]);

// --- Search typing -------------------------------------------------------------
// A fake search bar that behaves as measured on lg75 (2026-10-06): Right moves
// mic -> text box, Enter on the box opens the keyboard and focus reaches a key
// two polls later, Down from the mic enters an open keyboard, and letters only
// type while a keyboard key has focus.
assert.ok(isTypingKey(65) && isTypingKey(32) && isTypingKey(186) && isTypingKey(222) && isTypingKey(48));
assert.ok(!isTypingKey(13) && !isTypingKey(8) && !isTypingKey(37) && !isTypingKey(461) && !isTypingKey(403));

function fakeBar(focus, kb) {
  const bar = { focus, kb, typed: '', sent: [], timers: [] };
  const PATHS = {
    mic: ['YTLR-SEARCH-VOICE-MIC-BUTTON', 'YTLR-SEARCH-VOICE', 'YTLR-SEARCH-BAR', 'YTLR-APP'],
    box: ['YTLR-TEXT-BOX', 'YTLR-SEARCH-TEXT-BOX', 'YTLR-SEARCH-BAR', 'YTLR-APP'],
    key: ['YT-KEYBOARD-KEY', 'YTLR-SEARCH-KEYBOARD', 'YTLR-APP'],
    body: ['BODY', 'HTML'],
    tile: ['YTLR-TILE-RENDERER', 'YTLR-APP']
  };
  let opening = 0;
  bar.deps = {
    focusPath: () => {
      if (opening && --opening === 0) bar.focus = 'key';
      return PATHS[bar.focus];
    },
    keyboardOpen: () => bar.kb,
    send: (code, init) => {
      bar.sent.push(code);
      if (code === 39 && bar.focus === 'mic') bar.focus = 'box';
      else if (code === 13 && bar.focus === 'box') { bar.kb = true; bar.focus = 'body'; opening = 3; }
      else if (code === 40 && bar.kb && bar.focus === 'mic') bar.focus = 'key';
      else if (bar.focus === 'key' && init.key) bar.typed += init.key;
    },
    later: (fn) => bar.timers.push(fn)
  };
  bar.run = () => { while (bar.timers.length) bar.timers.shift()(); };
  return bar;
}
const keyEvt = (type, ch, extra) =>
  Object.assign({ type, keyCode: ch.toUpperCase().charCodeAt(0), key: ch }, extra);
function typeInto(bar, text, beforeRun) {
  const onKey = createSearchTyping(bar.deps);
  const taken = [];
  for (const ch of text) {
    taken.push(onKey(keyEvt('keydown', ch)));
    taken.push(onKey(keyEvt('keyup', ch)));
  }
  if (beforeRun) beforeRun(onKey);
  bar.run();
  return { onKey, taken };
}

// mic focused, keyboard closed: Right, Enter, then the held keys in order
let bar = fakeBar('mic', false);
let r = typeInto(bar, 'cat');
assert.deepEqual(bar.sent, [39, 13, 67, 65, 84]);
assert.equal(bar.typed, 'cat');
assert.ok(r.taken.every(Boolean)); // every original key and keyup swallowed
// text box focused: just Enter
bar = fakeBar('box', false);
typeInto(bar, 'dog');
assert.deepEqual(bar.sent, [13, 68, 79, 71]);
assert.equal(bar.typed, 'dog');
// search page with the keyboard already open but focus on the mic: Down
// (focus moves at once here, so 'b' is not held: it reaches YouTube as is)
bar = fakeBar('mic', true);
r = typeInto(bar, 'ab');
assert.deepEqual(bar.sent, [40, 65]);
assert.equal(bar.typed, 'a');
assert.deepEqual(r.taken, [true, false, false, false]);
// once on the keyboard, keys pass straight through
r = typeInto(bar, 'c');
assert.deepEqual(r.taken, [false, false]);
// modifiers and the layout's key survive the hold (Shift+a -> A, Danish æ)
bar = fakeBar('box', false);
const onKey = createSearchTyping(bar.deps);
onKey(keyEvt('keydown', 'A', { shiftKey: true }));
onKey({ type: 'keydown', keyCode: 186, key: 'æ' });
const seen = [];
const send = bar.deps.send;
bar.deps.send = (code, init) => { seen.push(init); send(code, init); };
bar.run();
assert.equal(bar.typed, 'Aæ');
assert.equal(seen[0].shiftKey, true);
// not in the search bar, or not a typing key, or our own replay: untouched
bar = fakeBar('tile', false);
assert.deepEqual(typeInto(bar, 'x').taken, [false, false]);
assert.deepEqual(bar.sent, []);
bar = fakeBar('mic', false);
const plain = createSearchTyping(bar.deps);
assert.equal(plain({ type: 'keydown', keyCode: 13 }), false); // Enter on the mic stays the remote's
assert.equal(plain({ type: 'keydown', keyCode: 65, key: 'a', ytafReplay: true }), false);
assert.equal(plain({ type: 'keydown', keyCode: 65, key: 'a', be: { keyCode: 65, shiftKey: false } }), false);
assert.equal(plain({ type: 'keydown', keyCode: 65, key: 'a', ctrlKey: true }), false);
assert.deepEqual(bar.sent, []);
// the bar never opens: give up after the poll budget, drop the keys, and the
// next key starts over instead of being held forever
bar = fakeBar('box', false);
bar.deps.send = (code) => bar.sent.push(code); // Enter does nothing
const stuck = createSearchTyping(bar.deps);
stuck(keyEvt('keydown', 'q'));
bar.run();
assert.deepEqual(bar.sent, [13]);
assert.equal(stuck(keyEvt('keydown', 'w')), true);
assert.deepEqual(bar.sent, [13, 13]);

console.log(
  'fork filters + frame step + shortcut registry + playback speed + keyboard layout + search typing: all tests passed'
);
