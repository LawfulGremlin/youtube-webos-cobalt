import { checkboxTools } from './checkboxTools.js';
import { configRead, configWrite } from './config.js';
import { text as languageText } from './languages/index.js';
import {
  isBrowseResponse,
  stripShortsFromBrowseResponse
} from './shorts-response-filter.mjs';

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
  });
}

installResponseFilter();
