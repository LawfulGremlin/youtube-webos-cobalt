// Fork-owned feature module (see FORK.md). The single `import './fork/index.js'`
// in adblock-main.js is the only wiring in upstream files — everything else
// lives under webapp/src/fork/ so upstream syncs merge cleanly.

import { configRead, configWrite } from '../config.js';
import { checkboxTools } from '../checkboxTools.js';
import { filterTvResponse } from './filters.mjs';

const FORK_DEFAULTS = {
  forkRemoveShorts: false
};

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

// Append our toggle rows once upstream's settings UI exists. The container is
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
}
appendForkUI();
