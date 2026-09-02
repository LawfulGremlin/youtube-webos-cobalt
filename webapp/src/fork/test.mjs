// Self-test for the fork filters: `node webapp/src/fork/test.mjs`.
// Plain node + assert — no framework, mirrors upstream's zero-test-infra style.

import assert from 'node:assert/strict';
import {
  filterTvResponse,
  getUnmatchedShoppingKeys,
  resetUnmatchedShoppingKeys
} from './filters.mjs';
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
import {
  SLOTS,
  registerShortcutAction,
  getAction,
  slotForKeyCode,
  cycleActionKey
} from './shortcut-registry.mjs';

const BOTH = { removeShorts: true, removeAds: true };

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

// Shorts shelf by explicit type
{
  const data = feed({ shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS' } }, normalTile());
  assert.equal(filterTvResponse(data, BOTH), 1);
  assert.equal(data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.length, 1);
}

// Shorts shelf by title
{
  const data = feed({ shelfRenderer: { title: { runs: [{ text: 'Shorts' }] } } });
  assert.equal(filterTvResponse(data, BOTH), 1);
}

// Non-shorts shelf survives, but shorts tiles inside it are removed
{
  const shelf = {
    shelfRenderer: {
      title: { runs: [{ text: 'Recommended' }] },
      content: {
        horizontalListRenderer: {
          items: [
            normalTile(),
            { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
            { tileRenderer: { onSelectCommand: { reelWatchEndpoint: {} } } },
            { reelItemRenderer: {} }
          ]
        }
      }
    }
  };
  const data = feed(shelf);
  assert.equal(filterTvResponse(data, BOTH), 3);
  assert.equal(shelf.shelfRenderer.content.horizontalListRenderer.items.length, 1);
}

// Feed ads: adSlotRenderer and reel ads
{
  const data = feed(
    { adSlotRenderer: {} },
    { command: { reelWatchEndpoint: { adClientParams: { isAd: 'true' } } } },
    { command: { reelWatchEndpoint: { videoType: 'REEL_VIDEO_TYPE_AD' } } },
    normalTile()
  );
  assert.equal(filterTvResponse(data, BOTH), 3);
}

// removeAds alone must not remove shorts; removeShorts alone must not remove ads
{
  const data = feed({ reelItemRenderer: {} }, { adSlotRenderer: {} });
  assert.equal(filterTvResponse(data, { removeAds: true }), 1);
}
{
  const data = feed({ reelItemRenderer: {} }, { adSlotRenderer: {} });
  assert.equal(filterTvResponse(data, { removeShorts: true }), 1);
}

// Both flags off: untouched, returns 0
{
  const data = feed({ reelItemRenderer: {} });
  assert.equal(filterTvResponse(data, {}), 0);
  assert.equal(data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.length, 1);
}

// Garbage tolerance
assert.equal(filterTvResponse(null, BOTH), 0);
assert.equal(filterTvResponse('"a string"', BOTH), 0);
assert.equal(filterTvResponse([null, 42, 'x'], BOTH), 0);
assert.equal(filterTvResponse({ a: { b: [null, { c: [] }] } }, BOTH), 0);

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

// Shopping/merch overlay: removed as an object property (playerOverlays), which
// is where the in-video QR card lives — the array path alone never reaches it.
{
  const data = {
    playerOverlays: {
      playerOverlayRenderer: {
        shoppingTimelyActionRenderer: { title: 'Rippling Muscles T-shirt' },
        decoratedPlayerBarRenderer: { keep: true }
      }
    }
  };
  assert.equal(filterTvResponse(data, { removeAds: true }), 1);
  assert.equal(
    data.playerOverlays.playerOverlayRenderer.shoppingTimelyActionRenderer,
    undefined
  );
  assert.ok(data.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer);
}

// The whole timely action goes, not just its shopping payload — otherwise the
// card's dismiss X and chrome are left behind as an empty shell.
{
  const data = {
    timelyActions: [
      { timelyActionRenderer: { content: { shoppingTimelyActionRenderer: { qr: true } } } },
      { timelyActionRenderer: { content: { someOtherActionRenderer: { keep: true } } } }
    ]
  };
  assert.equal(filterTvResponse(data, { removeAds: true }), 1);
  assert.equal(data.timelyActions.length, 1, 'non-shopping timely actions survive');
  assert.ok(data.timelyActions[0].timelyActionRenderer.content.someOtherActionRenderer);
}

// A timely action hung off an OBJECT property is dropped whole too — not just
// its inner shopping payload, which would leave the wrapper's dismiss X behind.
{
  const data = {
    playerOverlays: {
      timelyActionRenderer: { content: { shoppingTimelyActionRenderer: { qr: true } } },
      keepMe: { a: 1 }
    }
  };
  assert.equal(filterTvResponse(data, { removeAds: true }), 1);
  assert.equal(data.playerOverlays.timelyActionRenderer, undefined);
  assert.ok(data.playerOverlays.keepMe);
}

// An object-hung timely action WITHOUT shopping content survives whole.
{
  const data = {
    playerOverlays: {
      timelyActionRenderer: { content: { someOtherActionRenderer: { keep: 1 } } }
    }
  };
  assert.equal(filterTvResponse(data, { removeAds: true }), 0);
  assert.ok(data.playerOverlays.timelyActionRenderer.content.someOtherActionRenderer);
}

// Shopping overlay carried as a plain array item is dropped too.
{
  const data = { contents: [{ tileRenderer: { videoId: 'keep' } }, { shoppingTimelyActionRenderer: {} }] };
  assert.equal(filterTvResponse(data, { removeAds: true }), 1);
  assert.equal(data.contents.length, 1);
  assert.ok(data.contents[0].tileRenderer);
}

// Sign-in QR codes must survive: hiding qrCodeRenderer would lock the user out.
{
  const data = { signInPage: { qrCodeRenderer: { url: 'https://youtube.com/activate' } } };
  assert.equal(filterTvResponse(data, { removeAds: true }), 0);
  assert.ok(data.signInPage.qrCodeRenderer, 'sign-in QR must never be removed');
}

// Shopping removal rides the adblock toggle: off means untouched.
{
  const data = { playerOverlays: { shoppingTimelyActionRenderer: { a: 1 } } };
  assert.equal(filterTvResponse(data, { removeAds: false, removeShorts: true }), 0);
  assert.ok(data.playerOverlays.shoppingTimelyActionRenderer);
}

// Diagnostic: shopping-shaped keys we do NOT know are reported, never removed —
// this is what names the real renderer if the guessed list misses it.
{
  resetUnmatchedShoppingKeys();
  const data = { playerOverlays: { someUnknownShoppingThingRenderer: { a: 1 }, shoppingTimelyActionRenderer: {} } };
  filterTvResponse(data, { removeAds: true });
  assert.deepEqual(getUnmatchedShoppingKeys(), ['someUnknownShoppingThingRenderer']);
  assert.ok(data.playerOverlays.someUnknownShoppingThingRenderer, 'unknown keys must survive');
  assert.equal(data.playerOverlays.shoppingTimelyActionRenderer, undefined, 'known keys are removed');
  resetUnmatchedShoppingKeys();
}

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
  const copy = { keyCode: 67, he: { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, key: 'C' } };
  assert.equal(inheritOriginal(copy), true);
  assert.equal(copy.shiftKey, true);
  assert.equal(copy.key, 'C');
  assert.equal(Object.keys(copy).includes('shiftKey'), true, 'own enumerable, for Closure\'s for-in wrapper');
  assert.equal(inheritOriginal(copy), false);
  assert.equal(inheritOriginal({ keyCode: 67 }), false);
  assert.equal(inheritOriginal({ keyCode: 67, shiftKey: false, he: { shiftKey: true } }).valueOf(), false);
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

console.log(
  'fork filters + frame step + shortcut registry + playback speed + keyboard layout: all tests passed'
);
