let pendingToggle = false;

function isEditableTarget(target) {
  if (!target) return false;

  const tagName = (target.tagName || '').toUpperCase();
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable === true
  );
}

function isPlayerPage() {
  const body = document.body;
  if (!body) return false;

  return (
    body.classList.contains('WEB_PAGE_TYPE_WATCH') ||
    body.classList.contains('WEB_PAGE_TYPE_SHORTS')
  );
}

function getPlayer() {
  return (
    document.getElementById('ytlr-player__player-container-player') ||
    document.querySelector('.html5-video-player')
  );
}

function isTrackEnabled(track) {
  return !!(
    track &&
    (track.languageCode || track.vssId)
  );
}

function getCaptionsButton() {
  const selectors = [
    'ytlr-captions-button yt-button-container',
    'ytlr-captions-button ytlr-button',
    '[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_CAPTIONS"] yt-button-container',
    '[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_CAPTIONS"] ytlr-button',
    'ytlr-captions-button'
  ];

  for (let index = 0; index < selectors.length; index += 1) {
    const button = document.querySelector(selectors[index]);
    if (button) return button;
  }

  return null;
}

function getPressedState(button) {
  const stateElement =
    (button.hasAttribute('aria-pressed') && button) ||
    button.querySelector('[aria-pressed]');

  if (!stateElement) return null;
  return stateElement.getAttribute('aria-pressed') === 'true';
}

function activateCaptionsButton(button) {
  const instance = button.__instance;
  if (instance && typeof instance.onSelect === 'function') {
    instance.onSelect({
      type: 'click',
      target: button,
      currentTarget: button,
      bubbles: true,
      cancelable: true,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    return true;
  }

  if (typeof button.click !== 'function') return false;
  button.click();
  return true;
}

function toggleViaButton(player, notify) {
  const button = getCaptionsButton();
  if (!button) return false;

  try {
    if (!activateCaptionsButton(button)) return false;

    setTimeout(() => {
      let isEnabled = null;

      if (player && typeof player.getOption === 'function') {
        try {
          isEnabled = isTrackEnabled(
            player.getOption('captions', 'track')
          );
        } catch (error) {
          console.warn('[ytaf] Could not read subtitle state:', error);
        }
      }

      if (isEnabled === null) {
        isEnabled = getPressedState(button);
      }

      if (isEnabled !== null) {
        notify(isEnabled ? 'on' : 'off');
      }
    }, 250);
    return true;
  } catch (error) {
    console.warn('[ytaf] Subtitle shortcut button fallback failed:', error);
    return false;
  }
}

function toggleWhenButtonIsReady(player, notify) {
  if (toggleViaButton(player, notify)) return true;
  if (pendingToggle) return true;

  pendingToggle = true;
  let attempts = 0;
  const maxAttempts = 15;

  const retry = () => {
    attempts += 1;

    if (toggleViaButton(player, notify)) {
      pendingToggle = false;
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(retry, 100);
      return;
    }

    pendingToggle = false;
    notify('unavailable');
  };

  setTimeout(retry, 100);
  return true;
}

export function isSubtitleShortcut(evt) {
  if (!evt || evt.type !== 'keydown' || evt.repeat) return false;
  if (isEditableTarget(evt.target) || !isPlayerPage()) return false;

  return (
    evt.key === '0' ||
    evt.code === 'Digit0' ||
    evt.keyCode === 48 ||
    evt.which === 48
  );
}

export function toggleSubtitles(notify) {
  const showNotification =
    typeof notify === 'function' ? notify : () => {};

  if (!document.querySelector('video')) return false;

  const player = getPlayer();
  return toggleWhenButtonIsReady(player, showNotification);
}
