// Fork-owned InnerTube response filters (see FORK.md). Pure functions with
// no DOM or upstream imports so they run under plain node for self-tests
// (`node webapp/src/fork/test.mjs`) as well as inside the Cobalt webapp.
//
// Predicates ported from LawfulGremlin/youtube-webos src/adblock.js so both
// forks drop the same renderer shapes. Shorts removal and the sponsored
// shopping/QR overlay used to live here as well; both are upstream's now
// (shorts-response-filter.mjs, sponsored-qr-code-block.mjs) — see UPSTREAM.md.

const VIDEO_TYPE_REEL_AD = 'REEL_VIDEO_TYPE_AD';

// Feed-level ad items. Upstream adblock.js nulls the shallow ad keys
// (adPlacements, adSlots, ...) but leaves ad *items* sitting inside feed
// arrays; this removes them entirely, like youtube-webos does.
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
 * Walks a parsed InnerTube response and removes feed ad items in place.
 * Returns the number of removed items.
 *
 * ponytail: generic O(nodes) deep walk on every JSON.parse instead of
 * youtube-webos's hand-targeted response paths — switch to targeted paths
 * if this measures slow on a real TV.
 */
export function filterTvResponse(root, flags) {
  if (!(flags && flags.removeAds)) return 0;

  const MAX_DEPTH = 40;
  let removed = 0;

  function walk(value, depth) {
    if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return;

    if (Array.isArray(value)) {
      let writeIdx = 0;
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item && typeof item === 'object' && isFeedAd(item)) {
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

    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) walk(value[keys[i]], depth + 1);
  }

  walk(root, 0);
  return removed;
}
