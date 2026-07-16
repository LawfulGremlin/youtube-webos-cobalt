// Self-test for the fork filters: `node webapp/src/fork/test.mjs`.
// Plain node + assert — no framework, mirrors upstream's zero-test-infra style.

import assert from 'node:assert/strict';
import { filterTvResponse } from './filters.mjs';
import { framesForKey, stepTarget, FRAME_DURATION_SEC } from './frame-step.mjs';

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

// Frame step: key mapping (red back, blue forward incl. 191 alt, others inert)
assert.equal(framesForKey(403), -1);
assert.equal(framesForKey(406), 1);
assert.equal(framesForKey(191), 1);
assert.equal(framesForKey(404), 0); // green — settings menu, must stay untouched
assert.equal(framesForKey(405), 0);
assert.equal(framesForKey(undefined), 0);

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

console.log('fork filters + frame step: all tests passed');
