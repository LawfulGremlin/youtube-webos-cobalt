// Fork response filters, run on every parsed YouTube response. Called from
// inside upstream adblock.js's JSON.parse wrapper (one marked `fork:` line)
// rather than as a second JSON.parse assignment: upstream's preload turns
// JSON.parse into an accessor that holds exactly one downstream parser, so a
// second assignment would silently replace adblock.js's ad filter.

import { configRead } from '../config.js';
import { filterTvResponse } from './filters.mjs';
import {
  isBrowseResponse,
  stripShortsFromBrowseResponse
} from '../shorts-response-filter.mjs';

export function forkParseHook(result) {
  try {
    // Feed-ad item removal rides the existing adblock toggle.
    const removed = filterTvResponse(result, {
      removeAds: configRead('enableAdBlock')
    });
    if (removed) {
      console.info('[ytaf-fork] filtered ' + removed + ' feed item(s)');
    }
    // Upstream runs its Shorts filter only from adblockPreload.js, which the
    // Cobalt runtime executes before the document loads. On a runtime without
    // that hook (older binary, or the preload failed) nothing would filter
    // Shorts at all, so run the same filter from here in that case. Same
    // guard flag as the preload, so it never runs twice.
    if (
      !window.__ytafShortsResponseFilterInstalled &&
      !configRead('enableShorts') &&
      isBrowseResponse(result) &&
      stripShortsFromBrowseResponse(result)
    ) {
      console.info('[ytaf-fork] Shorts filtered without preload');
    }
  } catch (err) {
    console.warn('[ytaf-fork] filter failed:', err);
  }
}
