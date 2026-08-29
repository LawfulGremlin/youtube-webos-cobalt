import { checkboxTools } from './checkboxTools.js';
import { configRead, configWrite } from './config.js';
import { text as languageText } from './languages/index.js';
import {
  isBrowseResponse,
  stripShortsFromBrowseResponse
} from './shorts-response-filter.mjs';

function reloadForShortsChange() {
  window.setTimeout(() => {
    try {
      if (window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      } else if (window.location) {
        window.location.href = window.location.href;
      }
    } catch (err) {
      console.warn('[ytaf] Failed to reload after Shorts setting change:', err);
    }
  }, 100);
}

function installResponseFilter() {
  if (window.__ytafShortsResponseFilterInstalled) return;
  window.__ytafShortsResponseFilterInstalled = true;

  const previousParse = JSON.parse;
  JSON.parse = function () {
    const value = previousParse.apply(this, arguments);

    if (
      !configRead('enableShorts') &&
      isBrowseResponse(value) &&
      stripShortsFromBrowseResponse(value)
    ) {
      console.log('Shorts blocker removed browse renderers !');
    }

    return value;
  };
}

export function userScriptStartShortsBlockUI() {
  const control = document.querySelector('#__shorts');
  if (!control) return;

  const wrapper = control.parentElement;
  const description = wrapper && wrapper.querySelector('.desc');
  if (description) {
    description.textContent = languageText('ui', 'shorts');
  }

  const blocked = !Boolean(configRead('enableShorts'));
  if (blocked) {
    control.setAttribute('checked', 'checked');
  } else {
    control.removeAttribute('checked');
  }

  checkboxTools.setCallback('__shorts', (newState) => {
    configWrite('enableShorts', !newState);
    reloadForShortsChange();
  });
}

installResponseFilter();
