/*global navigate*/

// import './spatial-navigation-polyfill.js';
import './navigation-checkbox.js';

import './ui.css';

import { configRead, configWrite } from './config.js';
import { checkboxTools } from './checkboxTools.js';
import { text as languageText } from './languages/index.js';

let lastTabIndex = 0;

function text(key) {
  return languageText('ui', key);
}

export function userScriptStartUI() {
  console.info('[ytaf] userScriptStartUI() called');
  // We handle key events ourselves.
  if (!window.__spatialNavigation__) {
    window.__spatialNavigation__ = {};
  }
  window.__spatialNavigation__.keyMode = 'NONE';

  const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

  function getDirectionFromEvent(evt) {
    const key = (evt.key || '').toLowerCase();
    const code = (evt.code || '').toLowerCase();
    const keyCode = evt.keyCode ?? evt.which ?? evt.charCode;

    if (code === 'arrowup' || key === 'arrowup' || key === 'up' || keyCode === 38) {
      return 'up';
    }
    if (code === 'arrowdown' || key === 'arrowdown' || key === 'down' || keyCode === 40) {
      return 'down';
    }
    if (code === 'arrowleft' || key === 'arrowleft' || key === 'left' || keyCode === 37) {
      return 'left';
    }
    if (code === 'arrowright' || key === 'arrowright' || key === 'right' || keyCode === 39) {
      return 'right';
    }

    return null;
  }

  function getRemoteKeyCode(evt) {
    return evt.keyCode || evt.which || evt.charCode || 0;
  }

  function isGreenKey(evt) {
    const keyCode = getRemoteKeyCode(evt);
    return keyCode === 404 || keyCode === 172;
  }

  // fork: authoritative focus index for moveFocus(), updated ONLY by our
  // own focus placements (here and in focusMenuItem) — never re-derived
  // from document.activeElement mid-navigation. On this hardware, some
  // other mechanism (possibly native platform spatial navigation — see
  // window.navigate in navigation-checkbox.js/fork/index.js) was also
  // moving DOM focus for the very same keypress, and re-reading
  // activeElement here silently inherited that extra step, doubling every
  // move ("down" skipped a row every time). Advancing from our own
  // tracked position instead makes each move exactly one step no matter
  // what else does or doesn't also react to the keypress.
  let currentFocusIndex = -1;

  function moveFocus(dir) {
    const focusableItems = Array.from(
      uiContainer.querySelectorAll('[tabindex]')
    ).filter((item) => item.tabIndex > 0);

    if (focusableItems.length === 0) {
      return;
    }

    if (currentFocusIndex < 0 || currentFocusIndex >= focusableItems.length) {
      const domIndex = focusableItems.findIndex((item) => item === document.activeElement);
      currentFocusIndex = domIndex === -1 ? 0 : domIndex;
    }

    if (dir === 'down' || dir === 'right') {
      currentFocusIndex = (currentFocusIndex + 1) % focusableItems.length;
    } else if (dir === 'up' || dir === 'left') {
      currentFocusIndex = (currentFocusIndex - 1 + focusableItems.length) % focusableItems.length;
    }

    const nextItem = focusableItems[currentFocusIndex];
    if (nextItem) {
      // fork: reveal the target row before focusing it — .focus() on an
      // element inside a display:none ancestor is a silent no-op here.
      updateRowWindow(nextItem);
      nextItem.focus();
      lastTabIndex = nextItem.tabIndex;
    }
  }

  // fork: three earlier scroll/visibility attempts failed here — native
  // scrollIntoView (no-op), manual scrollTop with pixel sizing (also a
  // no-op: getComputedStyle reports maxHeight correctly, but this engine
  // doesn't actually enforce it as a layout constraint — clientHeight
  // exceeded the declared maxHeight when checked live via CDP), and an
  // earlier version of this exact row-windowing approach, which on
  // hardware locked up the whole menu once navigation crossed row 8.
  // Root cause, found via live remote-debugging (see FORK.md): this
  // engine has NO Element.prototype.closest AT ALL (confirmed on every
  // element, not just some), so the previous getRowWrapper() silently
  // returned null every time, the window position could never shift off
  // its initial [0,7], and focusing anything from row 8 onward failed
  // forever. Fixed by walking parentElement manually instead. Verified
  // live over a full 26-step down+up traversal (0 focus failures) before
  // ever touching hardware.
  const ROW_WINDOW_SIZE = 8;
  let rowWindowStart = 0;

  function getRowWrapper(item) {
    let node = item;
    while (node && node !== uiContainer) {
      if (node.classList && node.classList.contains('toggler-wrapper')) {
        return node;
      }
      node = node.parentElement || node.parentNode;
    }
    return null;
  }

  function updateRowWindow(focusedItem) {
    const rows = Array.from(uiContainer.querySelectorAll('.toggler-wrapper'));
    if (rows.length === 0) return;

    const windowSize = Math.min(ROW_WINDOW_SIZE, rows.length);
    const focusedIndex = rows.indexOf(getRowWrapper(focusedItem));

    if (focusedIndex !== -1) {
      if (focusedIndex < rowWindowStart) {
        rowWindowStart = focusedIndex;
      } else if (focusedIndex > rowWindowStart + windowSize - 1) {
        rowWindowStart = focusedIndex - windowSize + 1;
      }
    }
    rowWindowStart = Math.max(0, Math.min(rowWindowStart, rows.length - windowSize));
    const windowEnd = rowWindowStart + windowSize - 1;

    rows.forEach((row, index) => {
      row.style.display = index >= rowWindowStart && index <= windowEnd ? '' : 'none';
    });
  }

  const uiContainer = document.createElement('div');
  uiContainer.classList.add('ytaf-ui-container');
  uiContainer.style.display = 'none';
  uiContainer.style.visibility = 'hidden';
  uiContainer.setAttribute('tabindex', 0);
  uiContainer.addEventListener(
    'focus',
    () => {
      console.info('uiContainer focused!');
      const focusedElement = document.activeElement;
      if (
        focusedElement &&
        focusedElement !== uiContainer &&
        focusedElement.tabIndex !== null &&
        focusedElement.tabIndex > 0
      ) {
        lastTabIndex = focusedElement.tabIndex;
      }
    },
    true
  );
  uiContainer.addEventListener(
    'blur',
    () => console.info('uiContainer blured!'),
    true
  );

  // Key handling is done globally in the document handler to ensure a single
  // interception point and avoid duplicate handling across capture/bubble phases.

  const callbackConfig = (configName) => {
    return (newState) => {
      configWrite(configName, newState);
    };
  };

  const divTitle = document.createElement('div');
  divTitle.classList.add('center');
  const title = document.createElement('h1');
  title.textContent = text('title');
  divTitle.appendChild(title);
  uiContainer.appendChild(divTitle);

  uiContainer.appendChild(
    checkboxTools.add(
      '__adblock',
      text('adblock'),
      configRead('enableAdBlock'),
      callbackConfig('enableAdBlock')
    )
  );
  uiContainer.appendChild(
    checkboxTools.add(
      '__return_youtube_dislike',
      text('ryd'),
      configRead('enableReturnYouTubeDislike'),
      callbackConfig('enableReturnYouTubeDislike')
    )
  );
  uiContainer.appendChild(
    checkboxTools.add(
      '__sponsorblock',
      text('sponsorblock'),
      configRead('enableSponsorBlock'),
      callbackConfig('enableSponsorBlock')
    )
  );

  const sponsorBlock = document.createElement('div');
  sponsorBlock.classList.add('blockquote');
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_sponsor',
      text('sponsor'),
      configRead('enableSponsorBlockSponsor'),
      callbackConfig('enableSponsorBlockSponsor')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_intro',
      text('intro'),
      configRead('enableSponsorBlockIntro'),
      callbackConfig('enableSponsorBlockIntro')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_outro',
      text('outro'),
      configRead('enableSponsorBlockOutro'),
      callbackConfig('enableSponsorBlockOutro')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_interaction',
      text('interaction'),
      configRead('enableSponsorBlockInteraction'),
      callbackConfig('enableSponsorBlockInteraction')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_selfpromo',
      text('selfpromo'),
      configRead('enableSponsorBlockSelfPromo'),
      callbackConfig('enableSponsorBlockSelfPromo')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_music_offtopic',
      text('musicOfftopic'),
      configRead('enableSponsorBlockMusicOfftopic'),
      callbackConfig('enableSponsorBlockMusicOfftopic')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_preview',
      text('preview'),
      configRead('enableSponsorBlockPreview'),
      callbackConfig('enableSponsorBlockPreview')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_filler',
      text('filler'),
      configRead('enableSponsorBlockFiller'),
      callbackConfig('enableSponsorBlockFiller')
    )
  );
  sponsorBlock.appendChild(
    checkboxTools.add(
      '__sponsorblock_hook',
      text('hook'),
      configRead('enableSponsorBlockHook'),
      callbackConfig('enableSponsorBlockHook')
    )
  );
  uiContainer.appendChild(sponsorBlock);

  (document.body || document.documentElement).appendChild(uiContainer);

  let latestFocus = null;
  let focusKeepAliveTimer = null;

  function isContainerOpen() {
    return uiContainer.style.display !== 'none' && uiContainer.style.visibility !== 'hidden';
  }

  function applyVisibleContainerStyles() {
    // fork: 80vh/80vw never actually constrained the box on hardware —
    // Cobalt's minimal CSS engine appears not to evaluate vh/vw, so
    // maxHeight had no effect, content never "overflowed" it, overflow:auto
    // never engaged, and scrollTop became a silent no-op. Compute the same
    // 80% bound in JS and set plain pixels instead.
    const maxWidthPx = Math.round(window.innerWidth * 0.8) + 'px';
    const maxHeightPx = Math.round(window.innerHeight * 0.8) + 'px';

    Object.assign(uiContainer.style, {
      position: 'fixed',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      left: '64px',
      top: '64px',
      right: 'auto',
      bottom: 'auto',
      width: '720px',
      maxWidth: maxWidthPx,
      maxHeight: maxHeightPx,
      boxSizing: 'border-box',
      overflow: 'auto',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      background: '#05080c',
      color: '#ffffff',
      border: '6px solid #37ff77',
      borderRadius: '0',
      padding: '24px',
      fontSize: '22px',
      lineHeight: '1.25',
      transform: 'none',
      animation: 'none',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)'
    });
  }

  function focusMenuItem(preferredTabIndex = lastTabIndex) {
    const focusableItems = Array.from(
      uiContainer.querySelectorAll('[tabindex]')
    ).filter((item) => item.tabIndex > 0);

    let target = null;
    if (preferredTabIndex > 0) {
      target =
        focusableItems.find((item) => item.tabIndex === preferredTabIndex) ||
        focusableItems[0];
    } else {
      target = focusableItems[0];
    }

    if (target) {
      // fork: keep moveFocus()'s own index in sync with this explicit,
      // known focus placement, and reveal the row before focusing it —
      // same reason as in moveFocus().
      currentFocusIndex = focusableItems.indexOf(target);
      updateRowWindow(target);
      target.focus();
      if (target.tabIndex !== null && target.tabIndex > 0) {
        lastTabIndex = target.tabIndex;
      }
      return true;
    }

    uiContainer.focus();
    return false;
  }

  function openContainer() {
    console.info('Container: Showing & Focusing!');
    applyVisibleContainerStyles();
    latestFocus =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;

    setTimeout(() => {
      focusMenuItem(1);
    }, 0);
  }

  function keepContainerFocus() {
    if (isContainerOpen()) {
      const activeElement = document.activeElement;
      const hasFocusInside = Boolean(
        activeElement &&
        (activeElement === uiContainer || uiContainer.contains(activeElement))
      );

      if (!hasFocusInside) {
        latestFocus = activeElement;
        console.info('Container: Not have focus: Focusing!');
        focusMenuItem();
      }

      focusKeepAliveTimer = setTimeout(keepContainerFocus, 250);
    }
  }

  function menuHasFocus() {
    return Boolean(
      document.activeElement &&
      (document.activeElement === uiContainer || uiContainer.contains(document.activeElement))
    );
  }

  function captureMenuFocus() {
    if (!isContainerOpen() || menuHasFocus()) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
      latestFocus = activeElement;
    }
    focusMenuItem();
  }

  function closeContainer() {
    console.info('Container: Hiding!');
    if (focusKeepAliveTimer) {
      clearTimeout(focusKeepAliveTimer);
      focusKeepAliveTimer = null;
    }
    uiContainer.style.display = 'none';
    uiContainer.style.visibility = 'hidden';
    uiContainer.style.pointerEvents = 'none';
    uiContainer.blur();
    if (latestFocus != null) {
      latestFocus.focus();
    }
  }

  const eventHandler = (evt) => {
    const menuOpen = isContainerOpen();
    const focusInsideMenu = menuOpen && menuHasFocus();

    if (evt.type === 'keydown' && menuOpen) {
      if (!focusInsideMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        captureMenuFocus();
        return false;
      }

      const direction = getDirectionFromEvent(evt);
      if (direction) {
        evt.preventDefault();
        evt.stopPropagation();
        moveFocus(direction);
        return false;
      }

      if (
        evt.key === 'Enter' ||
        evt.key === ' ' ||
        evt.code === 'Space' ||
        evt.keyCode === 13 ||
        evt.keyCode === 32 ||
        evt.which === 13 ||
        evt.which === 32
      ) {
        evt.preventDefault();
        evt.stopPropagation();
        const focusedElement = document.querySelector(':focus');
        if (focusedElement && focusedElement.id) {
          // prevent the synthetic click from toggling again
          const wrapper = focusedElement.parentElement;
          if (wrapper) {
            wrapper.dataset.ytafSkipClick = '1';
            setTimeout(() => delete wrapper.dataset.ytafSkipClick, 300);
          }
          checkboxTools.toggleCheck(focusedElement.id);
        }
        return false;
      }

      if (evt.key === 'Escape' || evt.keyCode === 27 || evt.keyCode === 461 || evt.keyCode === 8) {
        evt.preventDefault();
        evt.stopPropagation();
        closeContainer();
        return false;
      }
    }

    if (isGreenKey(evt)) {
      console.info('Taking over!');
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.type === 'keydown') {
        if (!isContainerOpen()) {
          openContainer();
        } else {
          closeContainer();
        }
      }
      return false;
    } else if (
      evt.type === 'keydown' &&
      evt.charCode == 0 &&
      evt.keyCode == 187
    ) {
      // char '='
      if (!isContainerOpen()) {
        openContainer();
        evt.preventDefault();
        evt.stopPropagation();
      } else {
        closeContainer();
        evt.preventDefault();
        evt.stopPropagation();
      }
    }
    return true;
  };

  // Red, Green, Yellow, Blue
  // 403, 404, 405, 406
  // ---, 172, 170, 191
  document.addEventListener('keydown', eventHandler, true);
  document.addEventListener('keypress', eventHandler, true);
  document.addEventListener('keyup', eventHandler, true);

  setTimeout(() => {
    showNotification(text('openHint'), 3000, 'green');
  }, 2000);
}

export function showNotification(text, time = 3000, variant = 'yellow') {
  console.info('Show notification: ' + text);
  if (!document.querySelector('.ytaf-notification-container')) {
    console.info('Adding notification container');
    const c = document.createElement('div');
    c.classList.add('ytaf-notification-container');
    document.body.appendChild(c);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.textContent = text;
  elmInner.classList.add('message');
  elmInner.classList.add(`message-${variant}`);
  elmInner.classList.add('message-hidden');
  elm.appendChild(elmInner);
  document.querySelector('.ytaf-notification-container').appendChild(elm);

  setTimeout(() => {
    elmInner.classList.remove('message-hidden');
  }, 100);
  setTimeout(() => {
    elmInner.classList.add('message-hidden');
    setTimeout(() => {
      document.querySelector('.ytaf-notification-container').removeChild(elm);
    }, 1000);
  }, time);
}
