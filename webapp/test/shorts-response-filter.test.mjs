import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isBrowseResponse,
  isShortsPath,
  stripShortsFromBrowseResponse
} from '../src/shorts-response-filter.mjs';

test('recognizes Shorts navigation paths', () => {
  assert.equal(isShortsPath('/shorts/abc'), true);
  assert.equal(isShortsPath('/feed/shorts?bp=123'), true);
  assert.equal(isShortsPath('/watch?v=abc'), false);
});

test('removes Shorts entries from browse responses only', () => {
  const response = {
    contents: {
      items: [
        { videoRenderer: { videoId: 'normal' } },
        { shortsLockupViewModel: { entityId: 'short' } },
        {
          navigationEndpoint: {
            commandMetadata: {
              webCommandMetadata: { url: '/shorts/abc' }
            }
          }
        }
      ]
    }
  };

  assert.equal(isBrowseResponse(response), true);
  assert.equal(stripShortsFromBrowseResponse(response), true);
  assert.deepEqual(response.contents.items, [
    { videoRenderer: { videoId: 'normal' } }
  ]);
});

test('does not classify direct player responses as browse responses', () => {
  const playerResponse = {
    videoDetails: { videoId: 'short-video' },
    streamingData: { formats: [] },
    contents: { shortsLockupViewModel: {} }
  };

  assert.equal(isBrowseResponse(playerResponse), false);
});

test('removes FEshorts navigation entries but keeps ordinary browse entries', () => {
  const response = {
    onResponseReceivedActions: [
      {
        navigationEndpoint: {
          browseEndpoint: { browseId: 'FEshorts' }
        }
      },
      {
        navigationEndpoint: {
          browseEndpoint: { browseId: 'FEsubscriptions' }
        }
      }
    ]
  };

  assert.equal(stripShortsFromBrowseResponse(response), true);
  assert.deepEqual(response.onResponseReceivedActions, [
    {
      navigationEndpoint: {
        browseEndpoint: { browseId: 'FEsubscriptions' }
      }
    }
  ]);
});
