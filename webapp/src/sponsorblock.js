import { configRead } from './config';
import { showNotification } from './ui';
import { text } from './languages/index.js';

const sponsorblockAPI = 'https://sponsor.ajay.app/api';
const markerAttribute = 'data-ytaf-sponsorblock-marker';
const markerContainerAttribute = 'data-ytaf-sponsorblock-container';

const categories = [
  'sponsor',
  'intro',
  'outro',
  'interaction',
  'selfpromo',
  'music_offtopic',
  'preview',
  'filler',
  'hook'
];

const categoryConfig = {
  sponsor: 'enableSponsorBlockSponsor',
  intro: 'enableSponsorBlockIntro',
  outro: 'enableSponsorBlockOutro',
  interaction: 'enableSponsorBlockInteraction',
  selfpromo: 'enableSponsorBlockSelfPromo',
  music_offtopic: 'enableSponsorBlockMusicOfftopic',
  preview: 'enableSponsorBlockPreview',
  filler: 'enableSponsorBlockFiller',
  hook: 'enableSponsorBlockHook'
};

const categoryColors = {
  sponsor: '#00d400',
  intro: '#00ffff',
  outro: '#0202ed',
  interaction: '#cc00ff',
  selfpromo: '#ffff00',
  music_offtopic: '#ff9900',
  preview: '#008fd6',
  filler: '#7300ff',
  hook: '#395699'
};

let controller = null;

export function userScriptStartSponsorBlock() {
  if (controller) return;

  controller = new SponsorBlockController();
  window.sponsorblock = controller;
  controller.start();
}

function categoryLabel(category) {
  return text('sponsorBlock', category);
}

function enabledCategories() {
  return categories.filter((category) => configRead(categoryConfig[category]));
}

function getCurrentVideoId() {
  const candidates = [window.location.href, window.location.hash, window.location.search];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = String(candidate).match(/[?&#]v=([^&#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).replace(/^v=/, '');
    }
  }

  const responseId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
  if (responseId) return responseId;

  try {
    const playerResponse = window.ytplayer?.config?.args?.player_response;
    if (playerResponse) {
      return JSON.parse(playerResponse)?.videoDetails?.videoId || null;
    }
  } catch (err) {
    console.warn('[SponsorBlock] player_response parse failed:', err);
  }

  return null;
}

function getVideoDuration(video, segments) {
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  const responseDuration = Number(window.ytInitialPlayerResponse?.videoDetails?.lengthSeconds);
  if (Number.isFinite(responseDuration) && responseDuration > 0) {
    return responseDuration;
  }

  return segments.reduce((duration, segment) => Math.max(duration, segment.segment[1]), 0);
}

function normalizeSegments(results, videoId) {
  if (!results) return [];

  let segments = [];
  if (Array.isArray(results)) {
    if (results[0]?.segment) {
      segments = results;
    } else {
      const match = results.find((entry) => entry.videoID === videoId);
      segments = Array.isArray(match?.segments) ? match.segments : [];
    }
  } else if (Array.isArray(results.segments)) {
    segments = results.segments;
  }

  const allowed = enabledCategories();
  return segments
    .filter((entry) => {
      if (!entry || !Array.isArray(entry.segment) || entry.segment.length < 2) return false;
      if (entry.actionType && entry.actionType !== 'skip') return false;
      if (!allowed.includes(entry.category)) return false;

      const start = Number(entry.segment[0]);
      const end = Number(entry.segment[1]);
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    })
    .map((entry) => ({
      ...entry,
      segment: [Number(entry.segment[0]), Number(entry.segment[1])]
    }))
    .sort((a, b) => a.segment[0] - b.segment[0]);
}

function requestJSON(url, onSuccess, onFailure) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 8000;
  xhr.onload = () => {
    const body = xhr.responseText || '';
    if (xhr.status === 404) {
      onSuccess([]);
      return;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      onFailure(new Error(`SponsorBlock returned ${xhr.status}`), xhr.status, body);
      return;
    }

    try {
      onSuccess(JSON.parse(body), xhr.status, body);
    } catch (err) {
      onFailure(err, xhr.status, body);
    }
  };
  xhr.onerror = () => onFailure(new Error('SponsorBlock request failed'), xhr.status);
  xhr.ontimeout = () => onFailure(new Error('SponsorBlock request timed out'), xhr.status);
  xhr.send();
}

function isSponsorBlockMarkerNode(node) {
  if (!node || node.nodeType !== 1) return false;

  return Boolean(
    node.hasAttribute?.(markerContainerAttribute) ||
    node.hasAttribute?.(markerAttribute) ||
    node.closest?.(`[${markerContainerAttribute}]`)
  );
}

// Nur das eigene Einfügen ignorieren. Wird der Container von YouTube entfernt,
// muss die Mutation verarbeitet werden, damit er am neuen DOM-Knoten wieder erscheint.
function isOnlySponsorBlockMarkerAddition(mutation) {
  if (mutation.type !== 'childList') return false;

  const addedNodes = Array.prototype.slice.call(mutation.addedNodes || []);
  const removedNodes = Array.prototype.slice.call(mutation.removedNodes || []);

  return (
    addedNodes.length > 0 &&
    removedNodes.length === 0 &&
    addedNodes.every(isSponsorBlockMarkerNode)
  );
}

function getClosest(element, selector) {
  if (!element || element.nodeType !== 1) return null;
  if (element.closest) return element.closest(selector);

  const matches =
    element.matches ||
    element.webkitMatchesSelector ||
    element.mozMatchesSelector ||
    element.msMatchesSelector;

  let current = element;
  while (current && current.nodeType === 1) {
    if (matches && matches.call(current, selector)) return current;
    current = current.parentNode;
  }

  return null;
}

function getStableMarkerAnchor(progressBar) {
  if (!progressBar) return { anchor: null, parent: null };

  // Die innere progress-bar wird auf webOS laufend durch Incremental DOM
  // neu geschrieben. Deshalb previewbar nicht darin, sondern als Geschwister-
  // element des stabileren ytlr-progress-bar einfügen.
  const anchor = getClosest(progressBar, 'ytlr-progress-bar') || progressBar;
  return { anchor, parent: anchor.parentNode || null };
}

function findProgressBarParts() {
  const selectors = [
    'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
    '[idomkey="progress-bar"].afTAdb',
    '[idomkey="progress-bar"]'
  ];

  const visited = [];
  let fallback = null;

  for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
    const progressBars = document.querySelectorAll(selectors[selectorIndex]);

    for (let barIndex = 0; barIndex < progressBars.length; barIndex += 1) {
      const progressBar = progressBars[barIndex];
      if (visited.includes(progressBar)) continue;
      visited.push(progressBar);

      let segment = null;
      const children = progressBar.children || [];

      // Der aktuelle YouTube-DOM:
      // progress-bar enthält segment als direktes Kind.
      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        if (children[childIndex].getAttribute?.('idomkey') === 'segment') {
          segment = children[childIndex];
          break;
        }
      }

      // Fallback, falls YouTube noch einen Wrapper ergänzt.
      if (!segment) {
        segment = progressBar.querySelector('[idomkey="segment"]');
      }
      if (!segment) continue;

      const rect = progressBar.getBoundingClientRect();
      const result = { progressBar, segment };

      if (!fallback) fallback = result;

      if (
        (progressBar.offsetWidth || rect.width) > 0 &&
        (progressBar.offsetHeight || rect.height) > 0
      ) {
        return result;
      }
    }
  }

  return fallback;
}

class SponsorBlockController {
  video = null;
  active = true;
  videoID = null;
  segments = [];
  skippableCategories = [];
  fetchStatus = 'idle';
  fetchError = '';
  responseCount = 'n/a';
  lastStatus = 'n/a';
  requestUrl = '';
  lastBody = '';
  lastSkipText = 'none';
  markerStatus = 'none';
  domObserver = null;
  progressBar = null;
  progressSegment = null;
  overlay = null;
  markerCheckFrame = null;
  isProcessing = false;
  attachVideoTimeout = null;
  nextSkipTimeout = null;
  skipPollInterval = null;
  skipHandler = null;
  markerHandler = null;
  skipped = {};

  start() {
    this.syncVideoState();
    this.observePlayerUI();
    window.addEventListener('hashchange', () => this.syncVideoState(), true);
    document.addEventListener('yt-navigate-finish', () => this.syncVideoState(), true);
  }

  destroy() {
    this.active = false;

    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.markerCheckFrame !== null) {
      window.cancelAnimationFrame(this.markerCheckFrame);
      this.markerCheckFrame = null;
    }
    this.progressBar = null;
    this.progressSegment = null;
    this.overlay = null;

    if (this.nextSkipTimeout) {
      window.clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }
    if (this.skipPollInterval) {
      window.clearInterval(this.skipPollInterval);
      this.skipPollInterval = null;
    }
    if (this.attachVideoTimeout) {
      window.clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }
    if (this.video) {
      this.video.removeEventListener('play', this.skipHandler);
      this.video.removeEventListener('pause', this.skipHandler);
      this.video.removeEventListener('timeupdate', this.skipHandler);
      this.video.removeEventListener('durationchange', this.skipHandler);
      if (this.markerHandler) {
        this.video.removeEventListener('durationchange', this.markerHandler);
        this.video.removeEventListener('loadedmetadata', this.markerHandler);
      }
      this.video = null;
    }
  }

  syncVideoState() {
    if (!configRead('enableSponsorBlock')) {
      this.reset();
      return;
    }

    const nextVideoId = getCurrentVideoId();
    if (!nextVideoId) return;

    this.attachVideo();
    if (nextVideoId !== this.videoID) {
      this.loadVideo(nextVideoId);
      return;
    }
  }

  reset() {
    this.videoID = null;
    this.segments = [];
    this.skippableCategories = [];
    this.fetchStatus = 'disabled';
    this.fetchError = '';
    this.responseCount = 'n/a';
    this.lastStatus = 'n/a';
    this.requestUrl = '';
    this.lastBody = '';
    this.lastSkipText = 'none';
    this.markerStatus = 'none';
    this.overlay = null;
    this.progressBar = null;
    this.progressSegment = null;
    this.skipped = {};

    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.markerCheckFrame !== null) {
      window.cancelAnimationFrame(this.markerCheckFrame);
      this.markerCheckFrame = null;
    }
    if (this.nextSkipTimeout) {
      window.clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }
  }

  observePlayerUI() {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }

    const observeTarget = document.body || document.documentElement;
    if (!observeTarget) {
      this.markerStatus = 'waiting-for-document';
      return;
    }

    this.domObserver = new MutationObserver((mutations) => {
      if (this.isProcessing || !this.active) return;

      let shouldCheck = false;

      for (const mutation of mutations) {
        // Das eigene Einfügen darf keinen neuen Durchlauf auslösen.
        if (isOnlySponsorBlockMarkerAddition(mutation)) continue;

        // Relevant sind nur echte DOM-Umbauten durch YouTube.
        if (mutation.type === 'childList') {
          shouldCheck = true;
          break;
        }
      }

      if (shouldCheck) this.queueProgressBarCheck();
    });

    this.domObserver.observe(observeTarget, {
      childList: true,
      subtree: true
    });

    this.checkForProgressBar();
  }

  queueProgressBarCheck() {
    if (this.markerCheckFrame !== null || !this.active) return;

    this.markerCheckFrame = window.requestAnimationFrame(() => {
      this.markerCheckFrame = null;
      if (!this.active || this.isProcessing) return;

      this.isProcessing = true;
      try {
        this.checkForProgressBar();
      } finally {
        this.isProcessing = false;
      }
    });
  }

  stopMarkerObserver() {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    if (this.markerCheckFrame !== null) {
      window.cancelAnimationFrame(this.markerCheckFrame);
      this.markerCheckFrame = null;
    }
  }

  syncOverlayWithSegment() {
    if (!this.overlay || !this.progressSegment || !this.progressBar) return;

    // Optik vollständig vom originalen Cue übernehmen.
    this.overlay.className = this.progressSegment.className;
    this.overlay.style.cssText = this.progressSegment.style.cssText;

    // Da previewbar außerhalb der laufend neu geschriebenen progress-bar liegt,
    // muss nur ihre einmalige Geometrie auf die echte Leiste übertragen werden.
    const { parent } = getStableMarkerAnchor(this.progressBar);
    if (!parent) return;

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    const barRect = this.progressBar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const rootFontSize =
      parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

    this.overlay.style.left = `${(barRect.left - parentRect.left) / rootFontSize}rem`;
    this.overlay.style.top = `${(barRect.top - parentRect.top) / rootFontSize}rem`;
    this.overlay.style.width = `${barRect.width / rootFontSize}rem`;
    this.overlay.style.height = `${barRect.height / rootFontSize}rem`;
  }

  findExistingOverlay(progressBar) {
    const { parent } = getStableMarkerAnchor(progressBar);
    if (!parent) return null;

    const children = parent.children || [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (
        child.hasAttribute?.(markerContainerAttribute) &&
        child.getAttribute('data-ytaf-video-id') === this.videoID
      ) {
        return child;
      }
    }

    return null;
  }

  checkForProgressBar() {
    const parts = findProgressBarParts();
    if (!parts) {
      this.progressBar = null;
      this.progressSegment = null;
      this.markerStatus = 'waiting-for-progress-bar';
      return;
    }

    this.progressBar = parts.progressBar;
    this.progressSegment = parts.segment;

    const existingOverlay = this.findExistingOverlay(this.progressBar);
    if (existingOverlay) {
      this.overlay = existingOverlay;
      this.syncOverlayWithSegment();
      this.markerStatus = `rendered ${existingOverlay.children.length}`;
      this.stopMarkerObserver();
      return;
    }

    // Eine alte JS-Referenz kann übrig bleiben, obwohl YouTube den Knoten entfernt hat.
    this.overlay = null;
    this.drawOverlay();
  }

  attachVideo() {
    if (this.attachVideoTimeout) {
      window.clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    const nextVideo = document.querySelector('video');
    if (!nextVideo) {
      this.attachVideoTimeout = window.setTimeout(() => this.attachVideo(), 100);
      return;
    }

    if (nextVideo === this.video) {
      this.startSkipPoller();
      this.scheduleSkip();
      return;
    }

    if (this.video) {
      this.video.removeEventListener('play', this.skipHandler);
      this.video.removeEventListener('pause', this.skipHandler);
      this.video.removeEventListener('timeupdate', this.skipHandler);
      this.video.removeEventListener('durationchange', this.skipHandler);
      if (this.markerHandler) {
        this.video.removeEventListener('durationchange', this.markerHandler);
        this.video.removeEventListener('loadedmetadata', this.markerHandler);
      }
    }

    this.video = nextVideo;
    this.skipHandler = () => this.scheduleSkip();
    this.markerHandler = () => this.queueProgressBarCheck();
    this.video.addEventListener('play', this.skipHandler);
    this.video.addEventListener('pause', this.skipHandler);
    this.video.addEventListener('timeupdate', this.skipHandler);
    this.video.addEventListener('durationchange', this.skipHandler);
    this.video.addEventListener('durationchange', this.markerHandler);
    this.video.addEventListener('loadedmetadata', this.markerHandler);
    this.startSkipPoller();
    this.scheduleSkip();
  }

  loadVideo(videoId) {
    this.videoID = videoId;
    this.segments = [];
    this.skipped = {};
    this.fetchStatus = 'fetching';
    this.fetchError = '';
    this.responseCount = 'n/a';
    this.lastStatus = 'n/a';
    this.lastBody = '';
    this.lastSkipText = 'none';
    this.markerStatus = 'none';
    this.overlay = null;
    this.progressBar = null;
    this.progressSegment = null;

    const categoryParams = enabledCategories()
      .map((category) => `category=${encodeURIComponent(category)}`)
      .join('&');
    const actionParams = 'actionType=skip';
    this.requestUrl = `${sponsorblockAPI}/skipSegments?videoID=${encodeURIComponent(
      videoId
    )}&${categoryParams}&${actionParams}`;

    requestJSON(
      this.requestUrl,
      (results, status = 200, body = '') => this.handleSegments(results, status, body),
      (err, status = 'n/a', body = '') => this.handleError(err, status, body)
    );
  }

  handleSegments(results, status, body) {
    if (this.videoID !== getCurrentVideoId()) return;

    this.lastStatus = status;
    this.lastBody = String(body || '').substring(0, 180);
    this.responseCount = Array.isArray(results) ? results.length : results ? 1 : 0;
    this.segments = normalizeSegments(results, this.videoID);
    this.skippableCategories = enabledCategories();
    this.fetchStatus = this.segments.length ? 'segments-loaded' : 'no-segments';
    this.fetchError = '';
    this.attachVideo();
    this.scheduleSkip();
    this.observePlayerUI();
  }

  handleError(err, status, body) {
    if (this.videoID !== getCurrentVideoId()) return;

    this.lastStatus = status;
    this.lastBody = String(body || '').substring(0, 180);
    this.fetchStatus = 'fetch-error';
    this.fetchError = err?.message || String(err);
    this.segments = [];
    console.warn('[SponsorBlock] fetch failed:', err);
  }

  drawOverlay() {
    if (!this.progressBar || !this.progressSegment || !this.segments.length) {
      this.markerStatus = this.segments.length ? 'waiting-for-progress-bar' : 'no-segments';
      return;
    }

    const existingOverlay = this.findExistingOverlay(this.progressBar);
    if (existingOverlay) {
      this.overlay = existingOverlay;
      this.syncOverlayWithSegment();
      this.markerStatus = `rendered ${existingOverlay.children.length}`;
      this.stopMarkerObserver();
      return;
    }

    const duration = getVideoDuration(this.video, this.segments);
    if (!duration) {
      this.markerStatus = 'missing-duration';
      return;
    }

    const markerContainer = document.createElement('div');
    markerContainer.id = 'previewbar';
    markerContainer.setAttribute(markerContainerAttribute, 'true');
    markerContainer.setAttribute('data-ytaf-video-id', this.videoID || '');
    markerContainer.className = this.progressSegment.className;
    markerContainer.style.cssText = this.progressSegment.style.cssText;

    const barRect = this.progressBar.getBoundingClientRect();
    const barWidth = this.progressBar.offsetWidth || barRect.width;
    const rootFontSize =
      parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

    if (!barWidth) {
      this.markerStatus = 'missing-progress-bar-width';
      return;
    }

    let renderedCount = 0;

    this.segments.forEach((segmentData) => {
      const start = Math.max(0, segmentData.segment[0]);
      const end = Math.min(duration, segmentData.segment[1]);
      if (end <= start) return;

      const marker = document.createElement('div');
      marker.setAttribute(markerAttribute, 'true');
      marker.className = 'Mj9Xhb ox5idb';

      const leftRem = ((start / duration) * barWidth) / rootFontSize;
      const widthRem = (((end - start) / duration) * barWidth) / rootFontSize;

      marker.style.left = `${leftRem}rem`;
      marker.style.width = `${Math.max(widthRem, 0.03)}rem`;
      marker.style.backgroundColor = categoryColors[segmentData.category] || '#ffff00';
      marker.title = categoryLabel(segmentData.category);
      markerContainer.appendChild(marker);
      renderedCount += 1;
    });

    if (!renderedCount) {
      this.markerStatus = 'no-valid-markers';
      return;
    }

    // Nicht innerhalb von progress-bar einfügen: Cobalt/YouTube schreibt deren
    // Kinder während der Wiedergabe laufend neu. Als Geschwisterelement des
    // äußeren ytlr-progress-bar bleibt previewbar stabil und flackert nicht.
    const { anchor, parent } = getStableMarkerAnchor(this.progressBar);
    if (!anchor || !parent) {
      this.markerStatus = 'waiting-for-stable-anchor';
      return;
    }

    const nextSibling = anchor.nextSibling;
    if (nextSibling) {
      parent.insertBefore(markerContainer, nextSibling);
    } else {
      parent.appendChild(markerContainer);
    }

    this.overlay = markerContainer;
    this.syncOverlayWithSegment();
    this.markerStatus = `rendered ${renderedCount}`;
    this.stopMarkerObserver();

    console.info(
      '[SponsorBlock] markers rendered:',
      renderedCount,
      'video:',
      this.videoID
    );
  }

  renderMarkers() {
    this.checkForProgressBar();
  }

  skipCurrentSegment() {
    if (!this.video || !this.segments.length) return;

    const currentTime = this.video.currentTime;
    const activeSegment = this.segments.find((segment) => {
      const start = segment.segment[0];
      const end = segment.segment[1];
      return currentTime >= start - 0.25 && currentTime < end - 0.15;
    });

    if (!activeSegment) return;

    const key = `${activeSegment.category}:${activeSegment.segment[0]}:${activeSegment.segment[1]}`;
    if (this.skipped[key]) return;
    this.skipped[key] = true;

    const skipTo = Math.min(activeSegment.segment[1] + 0.01, this.video.duration || activeSegment.segment[1]);
    this.video.currentTime = skipTo;
    this.lastSkipText = `${activeSegment.category} ${activeSegment.segment[0].toFixed(
      1
    )}-${activeSegment.segment[1].toFixed(1)}`;

    showNotification(`${text('sponsorBlock', 'skipping')} ${categoryLabel(activeSegment.category)}`, 1600, 'yellow');
  }

  scheduleSkip() {
    if (this.nextSkipTimeout) {
      window.clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (!this.active || !this.video || this.video.paused) return;

    const nextSegments = this.getNextSkippableSegments();
    if (!nextSegments.length) return;

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    const delay = Math.max(0, (start - this.video.currentTime) * 1000);

    this.nextSkipTimeout = window.setTimeout(() => {
      if (!this.active || !this.video || this.video.paused) return;

      const activeSegments = this.getActiveSkippableSegments();
      if (!activeSegments.length) {
        this.scheduleSkip();
        return;
      }

      const skipEnd = activeSegments.reduce(
        (latestEnd, activeSegment) => Math.max(latestEnd, activeSegment.segment[1]),
        end
      );
      this.lastSkipText = `${activeSegments[0].category} ${start.toFixed(
        1
      )}-${skipEnd.toFixed(1)}`;
      this.video.currentTime = skipEnd;
      showNotification(`${text('sponsorBlock', 'skipping')} ${categoryLabel(activeSegments[0].category)}`, 1600, 'yellow');
      this.scheduleSkip();
    }, delay);
  }

  isSegmentSkippable(segment) {
    if (!this.skippableCategories.includes(segment.category)) return false;
    if (segment.actionType && segment.actionType !== 'skip') return false;
    return true;
  }

  getNextSkippableSegments() {
    if (!this.video || !this.segments) return [];
    const currentTime = this.video.currentTime;
    return this.segments
      .filter(
        (segment) =>
          this.isSegmentSkippable(segment) &&
          segment.segment[0] > currentTime - 0.3 &&
          segment.segment[1] > currentTime - 0.3
      )
      .sort((a, b) => a.segment[0] - b.segment[0]);
  }

  getActiveSkippableSegments() {
    if (!this.video || !this.segments) return [];
    const currentTime = this.video.currentTime;
    return this.segments
      .filter(
        (segment) =>
          this.isSegmentSkippable(segment) &&
          segment.segment[0] <= currentTime + 0.3 &&
          segment.segment[1] > currentTime - 0.3
      )
      .sort((a, b) => a.segment[0] - b.segment[0]);
  }

  startSkipPoller() {
    if (this.skipPollInterval) return;

    this.skipPollInterval = window.setInterval(() => {
      try {
        this.scheduleSkip();
      } catch (err) {
        console.warn('[SponsorBlock] skip poll failed:', err);
      }
    }, 250);
  }
}
