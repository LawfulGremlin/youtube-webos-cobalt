// Self-test for the fork filters: `node webapp/src/fork/test.mjs`.
// Plain node + assert — no framework, mirrors upstream's zero-test-infra style.

import assert from 'node:assert/strict';
import { filterTvResponse } from './filters.mjs';

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

console.log('fork filters: all tests passed');
