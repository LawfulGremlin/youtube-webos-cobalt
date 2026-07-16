// Fork-owned InnerTube response filters (see FORK.md). Pure functions with
// no DOM or upstream imports so they run under plain node for self-tests
// (`node webapp/src/fork/test.mjs`) as well as inside the Cobalt webapp.
//
// Predicates ported from LawfulGremlin/youtube-webos src/adblock.js so both
// forks drop the same renderer shapes.

// fork: the in-video shopping QR card ("Rippling Muscles T-shirt / Limited
// delivery areas", with its own dismiss X) is not a feed ad — it's a "timely
// action", YouTube's timed in-video overlay, which is why the adSlotRenderer
// path never touched it. Confirmed from the live DOM rather than guessed:
//
//   YTLR-TIMELY-ACTION            [idomkey="timely-action"]
//     └ YTLR-TIMELY-ACTION-RENDERER
//         └ YTLR-SHOPPING-TIMELY-ACTION-RENDERER
//             └ YTLR-QR-CODE-RENDERER [idomkey="productQrCode"]
//
// The TV client's tags mirror renderer names (ytlr-progress-bar ↔ progress-bar),
// so the shopping card is shoppingTimelyActionRenderer inside a
// timelyActionRenderer. Only the shopping variant is targeted — other timely
// actions are left alone, and qrCodeRenderer is deliberately NOT matched: sign-in
// uses a QR code too, and killing that would lock the user out of their account.
const SHOPPING_RENDERER_KEYS = ['shoppingTimelyActionRenderer'];

// A timely action wrapping a shopping card is dropped whole, so its dismiss X
// and chrome go with it rather than being left behind as an empty shell.
const TIMELY_ACTION_KEY = 'timelyActionRenderer';

// Anything that looks commerce-y but isn't in the list above. Recorded, never
// removed — removing on a loose regex would risk eating real content.
const SHOPPING_KEY_HINT = /(merch|shopping|product|commerce|storefront)/i;

const shoppingKeysSeen = Object.create(null);

/** Diagnostic: shopping-shaped renderer keys seen but NOT removed. */
export function getUnmatchedShoppingKeys() {
  return Object.keys(shoppingKeysSeen).sort();
}

export function resetUnmatchedShoppingKeys() {
  Object.keys(shoppingKeysSeen).forEach((key) => delete shoppingKeysSeen[key]);
}

const SHELF_TYPE_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';
const TILE_STYLE_SHORTS = 'TILE_STYLE_YTLR_SHORTS';
const CONTENT_TYPE_SHORTS = 'TILE_CONTENT_TYPE_SHORTS';
const VIDEO_TYPE_REEL_AD = 'REEL_VIDEO_TYPE_AD';
const SHORTS_SHELF_TITLE = 'Shorts';

function shelfTitle(shelf) {
  return (
    shelf.title?.runs?.[0]?.text ||
    shelf.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer
      ?.title?.runs?.[0]?.text ||
    ''
  );
}

function isShortsShelf(item) {
  const shelf = item.shelfRenderer;
  if (!shelf) return false;
  if (shelf.tvhtml5ShelfRendererType === SHELF_TYPE_SHORTS) return true;
  return shelfTitle(shelf) === SHORTS_SHELF_TITLE;
}

function isShortsTile(item) {
  const tile = item.tileRenderer;
  if (
    tile &&
    (tile.style === TILE_STYLE_SHORTS ||
      tile.contentType === CONTENT_TYPE_SHORTS ||
      tile.onSelectCommand?.reelWatchEndpoint)
  ) {
    return true;
  }
  return Boolean(
    item.reelItemRenderer ||
      item.contentType === CONTENT_TYPE_SHORTS ||
      item.onSelectCommand?.reelWatchEndpoint
  );
}

// Feed-level ad items. Upstream adblock.js nulls the shallow ad keys
// (adPlacements, adSlots, ...) but leaves ad *items* sitting inside feed
// arrays; this removes them entirely, like youtube-webos does.
function hasShoppingRenderer(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return false;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (hasShoppingRenderer(value[i], depth + 1)) return true;
    }
    return false;
  }

  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    if (SHOPPING_RENDERER_KEYS.indexOf(keys[i]) !== -1) return true;
    if (hasShoppingRenderer(value[keys[i]], depth + 1)) return true;
  }
  return false;
}

// In-video shopping overlay, either carried directly or wrapped in a timely
// action (the shopping card's actual home — see SHOPPING_RENDERER_KEYS).
function isShoppingItem(item) {
  for (let i = 0; i < SHOPPING_RENDERER_KEYS.length; i++) {
    if (item[SHOPPING_RENDERER_KEYS[i]]) return true;
  }
  if (item[TIMELY_ACTION_KEY]) return hasShoppingRenderer(item[TIMELY_ACTION_KEY]);
  return false;
}

function isFeedAd(item) {
  if (item.adSlotRenderer) return true;
  const endpoint = item.command?.reelWatchEndpoint;
  return (
    endpoint?.adClientParams?.isAd === true ||
    endpoint?.adClientParams?.isAd === 'true' ||
    endpoint?.videoType === VIDEO_TYPE_REEL_AD
  );
}

/**
 * Walks a parsed InnerTube response and removes shorts shelves/tiles and
 * feed ad items in place. Returns the number of removed items.
 *
 * ponytail: generic O(nodes) deep walk on every JSON.parse instead of
 * youtube-webos's hand-targeted response paths — switch to targeted paths
 * if this measures slow on a real TV.
 */
export function filterTvResponse(root, flags) {
  const removeShorts = Boolean(flags && flags.removeShorts);
  const removeAds = Boolean(flags && flags.removeAds);
  if (!removeShorts && !removeAds) return 0;

  const MAX_DEPTH = 40;
  let removed = 0;

  function shouldDrop(item) {
    if (!item || typeof item !== 'object') return false;
    if (removeAds && isShoppingItem(item)) return true;
    if (removeAds && isFeedAd(item)) return true;
    if (removeShorts && (isShortsShelf(item) || isShortsTile(item))) return true;
    return false;
  }

  function walk(value, depth) {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return;

    if (Array.isArray(value)) {
      let writeIdx = 0;
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (shouldDrop(item)) {
          removed += 1;
          continue;
        }
        walk(item, depth + 1);
        value[writeIdx] = item;
        writeIdx += 1;
      }
      value.length = writeIdx;
      return;
    }

    // fork: shopping overlays hang off objects (playerOverlays and friends),
    // not just feed arrays, so drop matching properties outright — the array
    // path above alone would never reach them.
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (removeAds && SHOPPING_RENDERER_KEYS.indexOf(key) !== -1) {
        delete value[key];
        removed += 1;
        continue;
      }

      if (SHOPPING_KEY_HINT.test(key) && value[key] && typeof value[key] === 'object') {
        shoppingKeysSeen[key] = true;
      }

      walk(value[key], depth + 1);
    }
  }

  walk(root, 0);
  return removed;
}
