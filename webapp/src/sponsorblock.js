import { configRead } from './config';
import { showNotification } from './ui';

let debugPanel = null;
let debugPanelInterval = null;

export function userScriptStartSponsorBlock() {
  installDebugPanelToggle();
}

function summarizeDomElement(element) {
  if (!element || !element.getBoundingClientRect) return 'none';

  const rect = element.getBoundingClientRect();
  const cls =
    element.className && typeof element.className === 'string'
      ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}`
      : '';

  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${cls} ${Math.round(
    rect.width
  )}x${Math.round(rect.height)} @${Math.round(rect.left)},${Math.round(
    rect.top
  )}`.substring(0, 170);
}

function summarizeElementChain(element) {
  const chain = [];
  let current = element;
  while (current && current !== document.body && chain.length < 3) {
    chain.push(summarizeDomElement(current));
    current = current.parentElement;
  }
  return chain.length ? chain.join(' < ') : 'none';
}

function getLowerBarProbeSummary() {
  const candidates = Array.prototype.slice
    .call(document.querySelectorAll('div, ytlr-progress-bar, ytlr-player-bar'))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ element, rect }) => {
      if (!element || element === document.body) return false;
      if (element.id === 'ytaf-player-debug-panel') return false;
      if (element.id === 'ytaf-sponsorblock-debug-bar') return false;
      if (element.closest?.('#ytaf-player-debug-panel, #ytaf-sponsorblock-debug-bar')) {
        return false;
      }
      return (
        rect.width > 180 &&
        rect.height >= 2 &&
        rect.height <= 120 &&
        rect.bottom > window.innerHeight * 0.45
      );
    })
    .sort((a, b) => {
      const aScore = a.rect.width - a.rect.height * 3 + a.rect.top / 8;
      const bScore = b.rect.width - b.rect.height * 3 + b.rect.top / 8;
      return bScore - aScore;
    })
    .slice(0, 5);

  return candidates
    .map(({ element }) => summarizeDomElement(element))
    .join(' | ')
    .substring(0, 620);
}

function debugLine(label, value) {
  return `${label}: ${value === undefined || value === null ? 'n/a' : value}`;
}

function shortText(value, limit = 120) {
  if (value === undefined || value === null) return 'n/a';
  const textValue = String(value).replace(/\s+/g, ' ').trim();
  return textValue.length > limit
    ? `${textValue.substring(0, limit - 1)}…`
    : textValue;
}

function shortElementSummary(value) {
  if (!value) return 'none';
  return shortText(value, 150);
}

function updateDebugPanel() {
  if (!debugPanel || debugPanel.style.display === 'none') return;

  const sb = window.sponsorblock;
  const ryd = window.returnYoutubeDislike;
  const video = sb?.video || document.querySelector('video');
  const overlayParent = sb?.segmentsoverlay?.parentElement;
  const activeElement = document.activeElement;

  debugPanel.textContent = [
    'YouTube webOS Cobalt AdFree Debug',
    debugLine('videoId', sb?.videoID),
    debugLine(
      'time',
      video
        ? `${video.currentTime.toFixed(1)} / ${Number(video.duration || 0).toFixed(
          1
        )} speed=${video.playbackRate.toFixed(2)}`
        : 'no video'
    ),
    debugLine(
      'state',
      video
        ? `paused=${video.paused} ready=${video.readyState} network=${video.networkState} ended=${video.ended}`
        : 'n/a'
    ),
    debugLine(
      'SponsorBlock',
      sb
        ? `${sb.fetchStatus} responses=${sb.responseCount} status=${sb.lastStatus} err=${sb.fetchError}`
        : 'n/a'
    ),
    debugLine(
      'SB details',
      sb
        ? `segments=${sb.segments.length} next=${sb.lastSkipText} slicer=${shortElementSummary(
          sb.lastSlicerText
        )}`
        : 'n/a'
    ),
    debugLine(
      'RYD',
      ryd
        ? `${ryd.fetchStatus} status=${ryd.lastStatus} err=${ryd.fetchError}`
        : 'n/a'
    ),
    debugLine(
      'RYD votes',
      ryd
        ? `likes=${ryd.likes} dislikes=${ryd.dislikes} rating=${ryd.rating} views=${ryd.viewCount}`
        : 'n/a'
    ),
    debugLine(
      'RYD target',
      ryd
        ? `${shortElementSummary(ryd.targetElement)} count=${ryd.injectedText}`
        : 'n/a'
    ),
    debugLine('focus', shortElementSummary(summarizeDomElement(activeElement))),
    debugLine('bar', shortElementSummary(sb?.lastSlicerText || 'none')),
    debugLine('overlay', shortElementSummary(summarizeDomElement(overlayParent))),
    debugLine('lower bars', shortText(getLowerBarProbeSummary(), 180))
  ].join('\n');
}

function ensureSponsorBlockMarkerStyles() {
  if (document.getElementById('ytaf-sponsorblock-marker-styles')) return;

  const style = document.createElement('style');
  style.id = 'ytaf-sponsorblock-marker-styles';
  style.textContent = `
.sponsorblock-slider,
#previewbar {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  z-index: 2000;
}
.ytaf-sponsorblock-marker,
#previewbar .previewbar,
.sponsorblock-slider .previewbar {
  position: absolute;
  top: 0;
  height: 12px;
  border-radius: 9001px;
  display: block;
  pointer-events: none;
  z-index: 2147483646;
}
.ytaf-sponsorblock-marker-host {
  overflow: visible !important;
}
.ytaf-sponsorblock-segment-container {
  top: 0%;
  height: 100%;
  width: 100%;
  pointer-events: none;
  position: absolute;
  overflow: hidden;
}
[idomkey='player-bar-renderer'] :not([idomkey='slider']) .ytaf-sponsorblock-segment-container {
  top: 0.1875rem;
  height: 75%;
}
[idomkey='progress-bar'].zylon-focus .ytaf-sponsorblock-segment-container {
  top: -25%;
  height: 150%;
}
.ytaf-sponsorblock-segment {
  opacity: 0.7;
  height: 100%;
  width: 100%;
  position: absolute;
  border-radius: 9001px;
  display: inline-block;
}
[idomkey='slider'],
[idomkey='progress-bar'] {
  overflow: unset !important;
}
`;
  document.head.appendChild(style);
}

function showDebugPanel() {
  if (!debugPanel) {
    debugPanel = document.createElement('pre');
    debugPanel.id = 'ytaf-player-debug-panel';
    debugPanel.style.position = 'fixed';
    debugPanel.style.left = '4vw';
    debugPanel.style.top = '8vh';
    debugPanel.style.maxWidth = '76vw';
    debugPanel.style.maxHeight = '50vh';
    debugPanel.style.padding = '14px 17px';
    debugPanel.style.margin = '0';
    debugPanel.style.overflow = 'hidden';
    debugPanel.style.whiteSpace = 'pre-wrap';
    debugPanel.style.wordBreak = 'break-word';
    debugPanel.style.background = 'rgba(0, 0, 0, 0.78)';
    debugPanel.style.border = '1px solid rgba(255, 226, 69, 0.88)';
    debugPanel.style.borderRadius = '8px';
    debugPanel.style.color = '#9cffb2';
    debugPanel.style.fontFamily = 'monospace';
    debugPanel.style.fontSize = '18px';
    debugPanel.style.lineHeight = '1.2';
    debugPanel.style.zIndex = '2147483647';
    debugPanel.style.pointerEvents = 'none';
    document.body.appendChild(debugPanel);
  }

  debugPanel.style.display = 'block';
  updateDebugPanel();

  if (!debugPanelInterval) {
    debugPanelInterval = setInterval(updateDebugPanel, 250);
  }
}

function hideDebugPanel() {
  if (debugPanel) {
    debugPanel.style.display = 'none';
  }

  if (debugPanelInterval) {
    clearInterval(debugPanelInterval);
    debugPanelInterval = null;
  }
}

function toggleDebugPanel() {
  if (!debugPanel || debugPanel.style.display === 'none') {
    showDebugPanel();
  } else {
    hideDebugPanel();
  }
}

function installDebugPanelToggle() {
  if (window.__ytafSponsorDebugToggleInstalled) return;
  window.__ytafSponsorDebugToggleInstalled = true;

  const eventHandler = (evt) => {
    // Yellow on LG remotes is usually 405, older webOS builds report 170.
    if (evt.charCode === 405 || evt.charCode === 170 || evt.keyCode === 405) {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.type === 'keydown') {
        toggleDebugPanel();
      }
      return false;
    }
    return true;
  };

  document.addEventListener('keydown', eventHandler, true);
  document.addEventListener('keypress', eventHandler, true);
  document.addEventListener('keyup', eventHandler, true);
}

// Copied from https://github.com/ajayyy/SponsorBlock/blob/9392d16617d2d48abb6125c00e2ff6042cb7bebe/src/config.ts#L179-L233
const barTypes = {
  sponsor: {
    color: '#00d400',
    opacity: '0.7',
    name: 'sponsored segment'
  },
  intro: {
    color: '#00ffff',
    opacity: '0.7',
    name: 'intro'
  },
  outro: {
    color: '#0202ed',
    opacity: '0.7',
    name: 'outro'
  },
  interaction: {
    color: '#cc00ff',
    opacity: '0.7',
    name: 'interaction reminder'
  },
  selfpromo: {
    color: '#ffff00',
    opacity: '0.7',
    name: 'self-promotion'
  },
  music_offtopic: {
    color: '#ff9900',
    opacity: '0.7',
    name: 'non-music part'
  },
  preview: {
    color: '#008fd6',
    opacity: '0.7',
    name: 'preview/recap'
  },
  filler: {
    color: '#7300ff',
    opacity: '0.7',
    name: 'filler/tangent'
  },
  hook: {
    color: '#395699',
    opacity: '0.7',
    name: 'hook/greeting'
  },
  poi_highlight: {
    color: '#ff1684',
    opacity: '0.8',
    name: 'highlight'
  },
  chapter: {
    color: '#ffffff',
    opacity: '0.45',
    name: 'chapter'
  }
};

const sponsorblockAPI = 'https://sponsor.ajay.app/api';

let lastNoSponsorVideoIDNotification = 0;

function isGerman() {
  return /^de\b/i.test(navigator.language || '');
}

function text(key) {
  const german = {
    prefix: 'SponsorBlock',
    noSegments: 'keine Segmente',
    segmentsLoaded: 'Segmente geladen',
    videoElementFound: 'Video gefunden',
    noVideoId: 'keine Video-ID',
    fetchFailed: 'Abruf fehlgeschlagen',
    timeout: 'Zeitüberschreitung',
    skipping: 'Überspringe'
  };
  const english = {
    prefix: 'SponsorBlock',
    noSegments: 'no segments',
    segmentsLoaded: 'segments loaded',
    videoElementFound: 'video element found',
    noVideoId: 'no video id',
    fetchFailed: 'fetch failed',
    timeout: 'timed out',
    skipping: 'Skipping'
  };
  return (isGerman() ? german : english)[key];
}

function sponsorNotify(message, timeout = 5000) {
  console.info('[SponsorBlock]', message);
}

function categoryDisplayName(category) {
  const german = {
    sponsor: 'Sponsor',
    intro: 'Intro',
    outro: 'Outro',
    interaction: 'Abo-Hinweis',
    selfpromo: 'Eigenwerbung',
    music_offtopic: 'Off-topic',
    preview: 'Vorschau',
    filler: 'Füller',
    hook: 'Begrüßung'
  };
  const english = {
    sponsor: 'sponsor',
    intro: 'intro',
    outro: 'outro',
    interaction: 'interaction',
    selfpromo: 'self-promotion',
    music_offtopic: 'off-topic',
    preview: 'preview',
    filler: 'filler',
    hook: 'hook'
  };
  return (isGerman() ? german : english)[category] || category;
}

function parseSponsorBlockResponse(textValue) {
  if (!textValue) return [];
  return JSON.parse(textValue);
}

function safeJsonSample(value, limit = 180) {
  try {
    return JSON.stringify(value).substring(0, limit);
  } catch (err) {
    return `sample failed: ${err.message || err}`;
  }
}

function xhrJSONWithTimeout(url, timeout, handler, onSuccess, onFailure) {
  const xhr = new XMLHttpRequest();
  xhr.onload = () => {
    console.info('SponsorBlock xhr response status:', xhr.status);
    const responseText = xhr.responseText || '';
    if (handler) {
      handler.lastStatus = xhr.status;
      handler.lastBody = responseText.substring(0, 160);
      handler.lastParsedType = 'n/a';
      handler.lastParsedSample = '';
      handler.lastNormalizedSample = '';
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const parsed = parseSponsorBlockResponse(responseText);
        if (handler) {
          handler.lastParsedType = Array.isArray(parsed)
            ? `array:${parsed.length}`
            : typeof parsed;
          handler.lastParsedSample = safeJsonSample(parsed);
        }
        onSuccess(parsed);
      } catch (err) {
        onFailure(new Error(`SponsorBlock parse failed: ${err.message || err}`));
      }
    } else if (xhr.status === 404) {
      onFailure(new Error('SponsorBlock returned 404'));
    } else {
      onFailure(new Error(`SponsorBlock returned ${xhr.status}`));
    }
  };
  xhr.onerror = () => onFailure(new Error('SponsorBlock request failed'));
  xhr.ontimeout = () =>
    onFailure(new Error(`SponsorBlock request ${text('timeout')}`));
  xhr.open('GET', url);
  xhr.timeout = timeout;
  xhr.send();
}

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;
  skipPollInterval = null;
  slicer = null;
  sliderInterval = null;
  sliderObserver = null;
  slider = null;
  progressBar = null;
  activeBarSelector = null;
  domObserver = null;
  progressBarCheckRaf = null;
  lastOverlayHash = null;
  lastMarkerFrameHash = null;
  markerNodes = [];

  segmentsoverlay = null;
  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = [];
  skippableCategories = [];
  fetchStatus = 'pending';
  fetchError = '';
  responseCount = 'n/a';
  requestUrl = '';
  lastStatus = 'n/a';
  lastBody = '';
  lastParsedType = 'n/a';
  lastParsedSample = '';
  lastNormalizedSample = '';
  lastSkipText = 'none';
  lastSlicerText = 'none';

  constructor(videoID) {
    this.videoID = videoID;
    this.skippableCategories = this.getSkippableCategories();
  }

  fetchSegments(url, onSuccess, onFailure) {
    xhrJSONWithTimeout(url, 8000, this, onSuccess, onFailure);
  }

  normalizeSegments(results) {
    if (!results) return [];

    if (Array.isArray(results)) {
      if (!results.length) return [];

      if (results[0].segment) {
        return results;
      }

      const matchedVideo = results.find((v) => v.videoID === this.videoID);
      return matchedVideo && Array.isArray(matchedVideo.segments)
        ? matchedVideo.segments
        : [];
    }

    return Array.isArray(results.segments) ? results.segments : [];
  }

  init() {
    this.scheduleSkipHandler = () => this.scheduleSkip();
    this.durationChangeHandler = () => this.buildOverlay();
    this.attachVideo();

    const categoryParams = [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'music_offtopic',
      'preview',
      'filler',
      'hook'
    ]
      .map((category) => `category=${category}`)
      .join('&');
    const actionParams = 'actionType=skip&actionType=mute';
    const url = `${sponsorblockAPI}/skipSegments?videoID=${encodeURIComponent(
      this.videoID
    )}&${categoryParams}&${actionParams}`;

    console.info('Sponsor:', this.videoID, 'going to make request', url);
    this.fetchStatus = 'fetching sponsor.ajay.app/api';
    this.fetchError = '';
    this.requestUrl = url;
    this.lastStatus = 'n/a';
    this.lastBody = '';
    this.lastParsedType = 'n/a';
    this.lastParsedSample = '';
    this.lastNormalizedSample = '';

    this.fetchSegments(
      url,
      (results) => this.handleFetchResults(results),
      (err) => this.handleFetchError(err)
    );
  }

  handleFetchError(err) {
    this.fetchStatus =
      this.lastParsedSample && this.lastStatus === 200
        ? 'post-parse-error'
        : 'fetch-error';
    this.fetchError = err.message || String(err);
    this.segments = [];
    console.warn('Sponsor:', this.videoID, 'fetch failed:', err);
    sponsorNotify(`${text('fetchFailed')} ${this.fetchError}`);
  }

  handleFetchResults(results) {
    this.responseCount = Array.isArray(results) ? results.length : results ? 1 : 0;
    const segments = this.normalizeSegments(results);
    this.lastNormalizedSample = safeJsonSample(segments);
    console.info('Sponsor:', this.videoID, 'Got it:', results);

    if (!segments.length) {
      this.fetchStatus = 'no-segments';
      this.fetchError = '';
      this.segments = [];
      console.info('Sponsor:', this.videoID, 'No segments found.');
      sponsorNotify(`${text('noSegments')} (${this.videoID})`);
      return;
    }

    this.segments = segments.sort(
      (a, b) => a.segment[0] - b.segment[0]
    );
    this.skippableCategories = this.getSkippableCategories();
    this.fetchStatus = 'segments-loaded';
    this.fetchError = '';
    sponsorNotify(`${this.segments.length} ${text('segmentsLoaded')}`);

    try {
      this.buildOverlay();
    } catch (err) {
      this.fetchError = `overlay: ${err.message || err}`;
      console.warn('Sponsor:', this.videoID, 'overlay error:', err);
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead('enableSponsorBlockSponsor')) {
      skippableCategories.push('sponsor');
    }
    if (configRead('enableSponsorBlockIntro')) {
      skippableCategories.push('intro');
    }
    if (configRead('enableSponsorBlockOutro')) {
      skippableCategories.push('outro');
    }
    if (configRead('enableSponsorBlockInteraction')) {
      skippableCategories.push('interaction');
    }
    if (configRead('enableSponsorBlockSelfPromo')) {
      skippableCategories.push('selfpromo');
    }
    if (configRead('enableSponsorBlockMusicOfftopic')) {
      skippableCategories.push('music_offtopic');
    }
    if (configRead('enableSponsorBlockPreview')) {
      skippableCategories.push('preview');
    }
    if (configRead('enableSponsorBlockFiller')) {
      skippableCategories.push('filler');
    }
    if (configRead('enableSponsorBlockHook')) {
      skippableCategories.push('hook');
    }
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video');
    if (!this.video) {
      console.info('Sponsor:', this.videoID, 'No video yet...');
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    console.info('Sponsor:', this.videoID, 'Video found, binding...');
    sponsorNotify(text('videoElementFound'), 2500);
    ensureSponsorBlockMarkerStyles();

    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('play', () => this.checkForProgressBar());
    this.video.addEventListener('durationchange', () => this.drawOverlay());
    this.observePlayerUI();
    this.startSkipPoller();
    this.scheduleSkip();
  }

  buildOverlay() {
    console.info('Sponsor:', this.videoID, 'Build overlay');
    if (this.segmentsoverlay) {
      console.info('Sponsor:', this.videoID, 'Overlay already built');
      this.checkForProgressBar();
      return;
    }

    if (!this.segments || !this.segments.length) {
      console.info('Sponsor:', this.videoID, 'No segments for overlay');
      return;
    }

    if (!this.video || !this.video.duration) {
      console.info('Sponsor:', this.videoID, 'No video duration yet');
      return;
    }

    const videoDuration = this.video.duration;
    console.info('Sponsor:', this.videoID, 'Video Duration', videoDuration);

    ensureSponsorBlockMarkerStyles();

    try {
      console.info('Sponsor:', this.videoID, 'checkForProgressBar');
      this.checkForProgressBar();
      console.info('Sponsor:', this.videoID, 'checkForProgressBar Done');
    } catch (err) {
      console.warn('Sponsor:', this.videoID, 'error', err);
    }
  }

  stopSliderWatcher() {
    if (this.sliderInterval) {
      clearInterval(this.sliderInterval);
      this.sliderInterval = null;
    }
    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
      this.sliderObserver = null;
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.progressBarCheckRaf) {
      cancelAnimationFrame(this.progressBarCheckRaf);
      this.progressBarCheckRaf = null;
    }
  }

  observePlayerUI() {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }

    const root = document.querySelector('ytlr-progress-bar') || document.body;
    if (!root) return;

    const observeTarget = root.parentNode || root;
    this.domObserver = new MutationObserver(() => {
      this.scheduleProgressBarCheck();
    });
    this.domObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });
  }

  scheduleProgressBarCheck() {
    if (!this.active || this.progressBarCheckRaf) return;
    this.progressBarCheckRaf = requestAnimationFrame(() => {
      this.progressBarCheckRaf = null;
      this.checkForProgressBar();
    });
  }

  findProgressBarTarget() {
    const selectors = [
      'ytlr-multi-markers-player-bar-renderer',
      'ytlr-multi-markers-player-bar-renderer [idomkey="segment"]',
      'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
      'ytlr-progress-bar [idomkey="slider"]',
      '[idomkey="progress-bar"] [idomkey="slider"]',
      '[idomkey="progress-bar"]',
      '.ytLrProgressBarSliderBase',
      '.afTAdb'
    ];

    if (this.activeBarSelector) {
      const cached = document.querySelector(this.activeBarSelector);
      if (cached) return cached;
      this.activeBarSelector = null;
    }

    for (let i = 0; i < selectors.length; i++) {
      const candidate = document.querySelector(selectors[i]);
      if (candidate) {
        this.activeBarSelector = selectors[i];
        return candidate;
      }
    }

    return null;
  }

  checkForProgressBar() {
    if (!this.active || !this.segments.length) {
      return;
    }

    const target = this.findProgressBarTarget();

    if (!target) {
      this.lastSlicerText = 'none';
      return;
    }

    if (
      this.markerNodes.length &&
      this.markerNodes.every((node) => node.isConnected) &&
      this.markerNodes[0].parentNode === target
    ) {
      this.progressBar = target;
      this.lastSlicerText = this.summarizeElement(
        target,
        this.activeBarSelector || 'connected'
      );
      this.drawOverlay();
      return;
    }

    this.progressBar = target;
    const targetStyle = window.getComputedStyle(target);
    if (targetStyle.position === 'static') {
      target.style.position = 'relative';
    }
    target.classList.add('ytaf-sponsorblock-marker-host');
    target.style.setProperty('overflow', 'visible', 'important');
    this.lastSlicerText = this.summarizeElement(
      target,
      this.activeBarSelector || 'progress'
    );
    this.drawOverlay();
  }

  drawOverlay() {
    if (!this.progressBar || !this.segments.length || !this.video) return;

    const duration = this.video.duration;
    if (!duration || isNaN(duration)) return;

    const overlayHash = [
      duration,
      this.progressBar,
      this.segments.length,
      this.skippableCategories.join(',')
    ].join('|');

    if (
      overlayHash === this.lastOverlayHash &&
      this.markerNodes.length &&
      this.markerNodes.every((node) => node.isConnected)
    ) {
      this.updateMarkerLayout(duration);
      return;
    }

    this.lastOverlayHash = overlayHash;
    this.removeMarkers();

    const markerFrame = this.getMarkerFrame();
    this.lastMarkerFrameHash = this.getMarkerFrameHash(markerFrame);
    this.segments.forEach((segment, index) => {
      const [start, end] = segment.segment;
      const barType = barTypes[segment.category] || {
        color: 'blue',
        opacity: 0.7
      };
      const marker = document.createElement('div');
      marker.className = 'ytaf-sponsorblock-marker';
      marker.style.position = 'absolute';
      marker.style.display = 'block';
      marker.style.pointerEvents = 'none';
      marker.style.zIndex = '2147483646';
      marker.style.minWidth = '2px';
      marker.style.right = 'auto';
      marker.style.bottom = 'auto';
      marker.style.margin = '0';
      marker.style.padding = '0';
      marker.style.transform = 'none';
      marker.style.webkitTransform = 'none';
      marker.setAttribute('data-ytaf-segment-index', `${index}`);
      marker.setAttribute(
        'data-ytaf-left-percent',
        `${Math.max(
          0,
          Math.min(100, (start / duration) * 100)
        )}`
      );
      marker.style.backgroundColor = this.isSegmentSkippable(segment)
        ? '#ffff00'
        : barType.color;
      marker.style.opacity = this.isSegmentSkippable(segment)
        ? '0.95'
        : barType.opacity;
      this.applyMarkerLayout(marker, segment, markerFrame, duration);
      this.progressBar.appendChild(marker);
      this.markerNodes.push(marker);
    });

    this.segmentsoverlay = this.markerNodes[0] || null;
    this.lastSlicerText = this.summarizeElement(
      this.progressBar,
      this.activeBarSelector || 'progress'
    );
  }

  updateMarkerLayout(duration) {
    if (!this.markerNodes.length || !this.progressBar) return;

    const markerFrame = this.getMarkerFrame();
    const frameHash = this.getMarkerFrameHash(markerFrame);
    if (frameHash === this.lastMarkerFrameHash) return;

    this.lastMarkerFrameHash = frameHash;
    this.markerNodes.forEach((marker, index) => {
      const segment = this.segments[index];
      if (marker && segment) {
        this.applyMarkerLayout(marker, segment, markerFrame, duration);
      }
    });
  }

  applyMarkerLayout(marker, segment, markerFrame, duration) {
    const [start, end] = segment.segment;
    const startRatio = Math.max(0, Math.min(1, start / duration));
    const endRatio = Math.max(startRatio, Math.min(1, end / duration));
    const left = Math.round(markerFrame.left + markerFrame.width * startRatio);
    const width = Math.max(
      2,
      Math.round(markerFrame.width * Math.max(0.0018, endRatio - startRatio))
    );
    const radius = Math.max(2, Math.round(markerFrame.height / 2));
    const startsAtZero = start <= 0.05;
    const endsAtDuration = end >= duration - 0.05;

    marker.style.top = `${markerFrame.top}px`;
    marker.style.height = `${markerFrame.height}px`;
    marker.style.left = `${left}px`;
    marker.style.width = `${width}px`;
    marker.style.maxWidth = `${markerFrame.width}px`;
    marker.style.borderTopLeftRadius = startsAtZero ? `${radius}px` : '0';
    marker.style.borderBottomLeftRadius = startsAtZero ? `${radius}px` : '0';
    marker.style.borderTopRightRadius = endsAtDuration ? `${radius}px` : '0';
    marker.style.borderBottomRightRadius = endsAtDuration ? `${radius}px` : '0';
  }

  getMarkerFrameHash(markerFrame) {
    return `${markerFrame.left}:${markerFrame.top}:${markerFrame.width}:${markerFrame.height}`;
  }

  getMarkerFrame() {
    const targetRect = this.progressBar.getBoundingClientRect();
    const segment =
      this.progressBar.matches?.('[idomkey="segment"]')
        ? this.progressBar
        : this.progressBar.querySelector?.('[idomkey="segment"]');

    if (segment) {
      const segmentRect = segment.getBoundingClientRect();
      if (segmentRect.height > 0 && segmentRect.width > 0) {
        const isExpanded =
          targetRect.height && targetRect.height > segmentRect.height * 2;
        const height = Math.max(
          2,
          Math.round(segmentRect.height) - (isExpanded ? 0 : 1)
        );
        const topOffset = isExpanded ? -1 : 0;
        return {
          left: Math.max(0, Math.round(segmentRect.left - targetRect.left)),
          top: Math.max(
            0,
            Math.round(segmentRect.top - targetRect.top) + topOffset
          ),
          width: Math.round(segmentRect.width),
          height
        };
      }
    }

    const height = Math.max(
      2,
      Math.min(12, Math.max(6, Math.round(targetRect.height || 12))) - 1
    );
    return {
      left: 0,
      top: Math.max(0, Math.round(((targetRect.height || height) - height) / 2)),
      width: Math.round(targetRect.width || window.innerWidth || 1920),
      height
    };
  }

  removeMarkers() {
    this.markerNodes.forEach((marker) => {
      if (marker && marker.parentElement) {
        marker.parentElement.removeChild(marker);
      }
    });
    this.markerNodes = [];
    this.segmentsoverlay = null;
    this.lastMarkerFrameHash = null;
  }

  summarizeElement(element, source) {
    const rect = element.getBoundingClientRect();
    const cls =
      element.className && typeof element.className === 'string'
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : '';
    return `${source}:${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${cls} ${Math.round(
      rect.width
    )}x${Math.round(rect.height)} @${Math.round(rect.left)},${Math.round(
      rect.top
    )}`.substring(0, 150);
  }

  isLikelyTimelineElement(element) {
    if (!element || element === document.body) return false;
    if (
      element.id === 'ytaf-sponsorblock-debug-bar' ||
      element.id === 'ytaf-player-debug-panel' ||
      element.closest?.(
        '#ytaf-sponsorblock-debug-bar, #ytaf-player-debug-panel, .ytaf-ui-container, .sponsorblock-slider'
      )
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 220 || rect.height < 4 || rect.height > 90) return false;
    if (rect.bottom < window.innerHeight * 0.35) return false;
    const text = `${element.id || ''} ${element.className || ''} ${element.tagName || ''
      }`;
    const idomkey =
      element.getAttribute && element.getAttribute('idomkey')
        ? element.getAttribute('idomkey')
        : '';
    if (/toggler|checkbox|ytaf|sponsorblock/i.test(text)) return false;
    if (idomkey === 'segment' || idomkey === 'progress-bar') return true;
    return /progress|bar|slider|scrub|seek|timeline|marker/i.test(
      `${text} ${idomkey}`
    );
  }

  scoreTimelineElement(element) {
    const rect = element.getBoundingClientRect();
    let score = rect.width - rect.height * 2 + rect.top / 10;
    const idomkey =
      element.getAttribute && element.getAttribute('idomkey')
        ? element.getAttribute('idomkey')
        : '';
    const text = `${element.id || ''} ${element.className || ''} ${idomkey}`;
    if (idomkey === 'segment') score += 1200;
    if (idomkey === 'progress-bar') score += 1000;
    if (rect.height <= 16) score += 900;
    if (rect.height <= 14) score += 250;
    if (rect.height > 40) score -= 800;
    if (/progress|timeline|seek/i.test(text)) score += 400;
    if (/slider|scrub/i.test(text)) score += 250;
    if (/multi-markers|markers/i.test(text)) score += 500;
    if (/played|buffer/i.test(text)) score -= 200;
    return score;
  }

  prepareSlicer(element, source) {
    this.lastSlicerText = this.summarizeElement(
      element,
      element.__ytafSlicerSource || source
    );
    return element;
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active) {
      console.info('Sponsor:', this.videoID, 'No longer active, ignoring...');
      return;
    }

    if (!this.video) {
      return;
    }

    if (this.video.paused) {
      console.info('Sponsor:', this.videoID, 'Currently paused, ignoring...');
      return;
    }

    const nextSegments = this.getNextSkippableSegments();

    if (!nextSegments.length) {
      // console.info("Sponsor:", this.videoID, 'No more segments');
      return;
    }

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    const delay = Math.max(0, (start - this.video.currentTime) * 1000);

    this.nextSkipTimeout = setTimeout(() => {
      if (this.video.paused) {
        console.info('Sponsor:', this.videoID, 'Currently paused, ignoring...');
        return;
      }

      const activeSegments = this.getActiveSkippableSegments();
      if (!activeSegments.length) {
        this.scheduleSkip();
        return;
      }

      const skipEnd = activeSegments.reduce(
        (latestEnd, activeSegment) => Math.max(latestEnd, activeSegment.segment[1]),
        end
      );
      const skipName = categoryDisplayName(activeSegments[0].category);
      console.info('Sponsor:', this.videoID, 'Skipping', activeSegments);
      this.lastSkipText = `${activeSegments[0].category} ${start.toFixed(
        1
      )}-${skipEnd.toFixed(1)}`;
      showNotification(`${text('skipping')} ${skipName}`, 1800);
      this.video.currentTime = skipEnd;
      this.scheduleSkip();
    }, delay);
  }

  isSegmentSkippable(segment) {
    if (!this.skippableCategories.includes(segment.category)) {
      return false;
    }

    if (segment.actionType && segment.actionType !== 'skip') {
      return false;
    }

    return true;
  }

  getNextSkippableSegments() {
    if (!this.video || !this.segments) return [];
    const currentTime = this.video.currentTime;
    const nextSegments = this.segments.filter(
      (segment) =>
        this.isSegmentSkippable(segment) &&
        segment.segment[0] > currentTime - 0.3 &&
        segment.segment[1] > currentTime - 0.3
    );
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);
    return nextSegments;
  }

  getActiveSkippableSegments() {
    if (!this.video || !this.segments) return [];
    const currentTime = this.video.currentTime;
    const activeSegments = this.segments.filter(
      (segment) =>
        this.isSegmentSkippable(segment) &&
        segment.segment[0] <= currentTime + 0.3 &&
        segment.segment[1] > currentTime - 0.3
    );
    activeSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);
    return activeSegments;
  }

  startSkipPoller() {
    if (this.skipPollInterval) return;

    this.skipPollInterval = setInterval(() => {
      try {
        this.scheduleSkip();
      } catch (err) {
        console.warn('Sponsor:', this.videoID, 'poll error', err);
      }
    }, 250);
  }

  destroy() {
    console.info('Sponsor:', this.videoID, 'Destroying');

    this.active = false;

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.skipPollInterval) {
      clearInterval(this.skipPollInterval);
      this.skipPollInterval = null;
    }

    if (this.attachVideoTimeout) {
      clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    this.stopSliderWatcher();

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener(
        'durationchange',
        this.durationChangeHandler
      );
    }

    this.removeMarkers();
    this.slider = null;
    this.progressBar = null;
    this.activeBarSelector = null;
    this.lastOverlayHash = null;

    console.info('Sponsor:', this.videoID, 'Destroyed');
  }
}

// When this global variable was declared using let and two consecutive hashchange
// events were fired (due to bubbling? not sure...) the second call handled below
// would not see the value change from first call, and that would cause multiple
// SponsorBlockHandler initializations... This has been noticed on Chromium 38.
// This either reveals some bug in chromium/webpack/babel scope handling, or
// shows my lack of understanding of javascript. (or both)
function getVideoIDFromLocation() {
  try {
    const candidates = [location.hash, location.search, location.href];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = candidate.startsWith('#')
        ? candidate.substring(1)
        : candidate;
      const questionMarkIndex = normalized.indexOf('?');
      const query =
        questionMarkIndex >= 0 ? normalized.substring(questionMarkIndex) : normalized;
      const fromParams = new URLSearchParams(query).get('v');
      if (fromParams) return fromParams;

      const match = normalized.match(/(?:[?&]|^)v=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }

    const playerResponse = window.ytInitialPlayerResponse;
    if (playerResponse?.videoDetails?.videoId) {
      return playerResponse.videoDetails.videoId;
    }

    const playerResponseText = window.ytplayer?.config?.args?.player_response;
    if (playerResponseText) {
      const parsed = JSON.parse(playerResponseText);
      if (parsed?.videoDetails?.videoId) return parsed.videoDetails.videoId;
    }

    return window.__ytafLastVideoId || null;
  } catch (err) {
    const match = location.hash.match(/(?:[?&]|^)v=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : window.__ytafLastVideoId || null;
  }
}

window.sponsorblock = null;
let initTimeout = null;

function hashChange() {
  if (initTimeout) {
    clearTimeout(initTimeout);
  }

  initTimeout = setTimeout(() => {
    let videoID = getVideoIDFromLocation();
    try {
      const newURL = new URL(location.hash.substring(1), location.href);
      videoID = newURL.searchParams.get('v') || videoID;
    } catch (err) {
      console.warn('Sponsor: URL parse failed', err);
    }
    const needsReload =
      videoID &&
      (!window.sponsorblock || window.sponsorblock.videoID != videoID);

    console.info(
      'Sponsor:',
      videoID,
      'hashchange',
      window.sponsorblock,
      window.sponsorblock ? window.sponsorblock.videoID : null,
      needsReload
    );

    if (!videoID) {
      if (
        configRead('enableSponsorBlock') &&
        Date.now() - lastNoSponsorVideoIDNotification > 10000
      ) {
        lastNoSponsorVideoIDNotification = Date.now();
        sponsorNotify(
          `${text('noVideoId')}, hash=${location.hash.substring(0, 80)}`
        );
      }
      return;
    }

    if (needsReload) {
      if (window.sponsorblock) {
        try {
          window.sponsorblock.destroy();
        } catch (err) {
          console.warn('window.sponsorblock.destroy() failed!', err);
        }
        window.sponsorblock = null;
      }

      if (configRead('enableSponsorBlock')) {
        console.info('Sponsor', videoID, 'initialize');
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
      } else {
        console.info('SponsorBlock disabled, not loading');
      }
    }
  }, 10);
}

window.addEventListener('hashchange', hashChange, false);

if (document.readyState === 'loading') {
  window.addEventListener('load', () => setTimeout(hashChange, 500), {
    once: true
  });
} else {
  setTimeout(hashChange, 500);
}
