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

// fork: exported so the settings menu can show each category's swatch in the
// same colour the marker is drawn in, without a second copy of these values.
export const categoryColors = {
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

// fork: markers live in <body>, not next to the player bar. YouTube's
// Incremental DOM prunes any foreign node inside the player subtree —
// confirmed live via CDP: probe nodes appended as a sibling of
// ytlr-progress-bar (the "stable anchor" this file used to pick) and one
// level above it were both gone within seconds of playback resuming, while
// an identical probe appended to <body> survived. That pruning is what made
// markers invisible: drawOverlay() reported "rendered 1", then the container
// was silently detached — and since drawOverlay() also stops the mutation
// observer once it succeeds, nothing ever noticed or redrew it. <body> is
// the only host that survives, so the overlay is position:fixed and follows
// the bar's viewport rect instead (see syncOverlayWithSegment /
// maintainMarkers, which also keep it alive if it's ever removed anyway).
function getMarkerHost() {
  return document.body || document.documentElement || null;
}

function parseCssColor(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (text.charAt(0) === '#') {
    const digits =
      text.length === 4
        ? text[1] + text[1] + text[2] + text[2] + text[3] + text[3]
        : text.substring(1);
    const packed = parseInt(digits, 16);
    if (!Number.isFinite(packed)) return null;
    return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255, a: 1 };
  }

  const match = text.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => parseFloat(part));
  if (parts.length < 3 || !parts.every((part) => Number.isFinite(part))) return null;

  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

// fork: markers can't actually be drawn *behind* the timeline (see
// clipMarkersToProgress for why), but the result is reproducible: the track is
// a translucent white wash over whatever is beneath it, so a colour sitting
// under it composites to exactly this. Pre-blending gives the muted look
// without needing to be underneath anything. The track colour is read from the
// live element rather than hardcoded, so a restyle upstream carries over.
function blendUnderTrack(color, trackColor) {
  const base = parseCssColor(color);
  const track = parseCssColor(trackColor);
  if (!base) return color;
  // A fully opaque track would blend the marker into the track's own colour —
  // which is what being behind one would really look like, i.e. invisible.
  // Show the unmuted colour instead; a visible marker beats an accurate one.
  if (!track || !track.a || track.a >= 1) return color;

  const mix = (channel, over) => Math.round(track.a * over + (1 - track.a) * channel);
  return `rgb(${mix(base.r, track.r)}, ${mix(base.g, track.g)}, ${mix(base.b, track.b)})`;
}

// fork: the overlay hangs off <body>, so it does not inherit whatever the
// player does to hide its controls — it has to mirror it manually. YouTube's
// TV client fades the transport controls out with opacity:0 on an ANCESTOR of
// the bar (confirmed live via CDP: with controls away, the slider itself still
// reports opacity 1 and a perfectly valid 1728x9 rect, while YTLR-PROGRESS-BAR
// and YT-FOCUS-CONTAINER above it sit at opacity 0). So neither the slider's
// own opacity nor its size can tell us whether it is on screen — only the
// product of the whole chain can. Returns 0 as soon as anything hides it.
function getEffectiveOpacity(element) {
  let opacity = 1;
  let node = element;

  while (node && node.nodeType === 1) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;

    const nodeOpacity = parseFloat(style.opacity);
    if (Number.isFinite(nodeOpacity)) opacity *= nodeOpacity;
    if (opacity <= 0.01) return 0;

    node = node.parentNode;
  }

  return opacity;
}

function findProgressBar() {
  // fork: prefer the "slider" element — it is the visible track (1728x9 on a
  // 1080p panel), while progress-bar is the whole 1728x102 control block.
  // Measuring progress-bar drew a 102px-tall slab over the video instead of
  // a thin line along the timeline. The old idomkey="segment" reference this
  // code used to copy geometry/style from no longer exists in YouTube's TV
  // client at all (confirmed live: zero matches during real playback).
  const selectors = [
    'ytlr-progress-bar [idomkey="slider"]',
    '[idomkey="slider"]',
    'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
    '[idomkey="progress-bar"].afTAdb',
    '[idomkey="progress-bar"]'
  ];

  let fallback = null;

  for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
    const candidates = document.querySelectorAll(selectors[selectorIndex]);

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const rect = candidate.getBoundingClientRect();

      if (!fallback) fallback = candidate;

      if (
        (candidate.offsetWidth || rect.width) > 0 &&
        (candidate.offsetHeight || rect.height) > 0
      ) {
        return candidate;
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
    this.clearOverlay();

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
    this.clearOverlay();
    this.progressBar = null;
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
    if (!this.overlay || !this.progressBar) return;

    // Hide with the controls instead of leaving markers stranded on top of the
    // video. Size alone is not enough to detect that — see getEffectiveOpacity.
    const barRect = this.progressBar.getBoundingClientRect();
    const barOpacity = getEffectiveOpacity(this.progressBar);
    if (barRect.width <= 0 || barRect.height <= 0 || barOpacity <= 0.01) {
      this.overlay.style.display = 'none';
      return;
    }

    // The overlay is position:fixed on <body> (see getMarkerHost), so the
    // bar's viewport rect is already the coordinate space we need — no
    // offset-parent math, and it re-syncs as the controls animate in and out
    // (the bar slides on a transform, which getBoundingClientRect accounts
    // for). Mirroring the opacity rather than snapping to visible lets the
    // markers fade along with the controls instead of popping in.
    this.overlay.style.display = 'block';
    this.overlay.style.opacity = String(barOpacity);
    this.overlay.style.left = `${barRect.left}px`;
    this.overlay.style.top = `${barRect.top}px`;
    this.overlay.style.width = `${barRect.width}px`;
    this.overlay.style.height = `${barRect.height}px`;
    this.clipMarkersToProgress(barRect);
  }

  // fork: don't paint over the part of a segment that has already played, so
  // YouTube's own progress fill stays visible inside a marker and you can see
  // where playback is within a segment. Drawing the markers *behind* the bar
  // instead — the obvious way — isn't available here: anything inserted into
  // the slider is pruned in under 100ms (it is re-patched constantly as the
  // fill advances; measured live, gone before the first 100ms sample), and
  // body-level stacking can't be relied on either, since Cobalt composites
  // video by punching through the web layer and content painted below the
  // player risks going with it. The played fill is opaque white anyway
  // (rgb(241,241,241) — it would hide a marker behind it exactly like this
  // does), so clipping matches what "behind" would look like, and keeps the
  // marker colour clean where it does show instead of tinting it through the
  // track's translucent white.
  clipMarkersToProgress(barRect) {
    if (!this.overlay || !barRect || !barRect.width) return;

    const duration = getVideoDuration(this.video, this.segments);
    if (!duration) return;

    const currentTime = this.video ? this.video.currentTime : 0;

    // fork: the knob sits centred on the playhead, which is exactly where a
    // clipped marker starts — so the marker used to cut across its right half
    // (measured: knob 1724-1772, marker starting at 1693). Yield to wherever
    // the knob actually is rather than assuming it tracks currentTime: while
    // scrubbing it runs ahead of playback, which is precisely when you're
    // looking at it.
    const knob = document.querySelector('[idomkey="playheadKnob"]');
    const knobRect = knob ? knob.getBoundingClientRect() : null;
    const knobLeft = knobRect && knobRect.width ? knobRect.left - barRect.left : null;
    const knobRight = knobRect && knobRect.width ? knobRect.right - barRect.left + 2 : null;

    const markers = this.overlay.children || [];

    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const start = parseFloat(marker.getAttribute('data-sb-start'));
      const end = parseFloat(marker.getAttribute('data-sb-end'));
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

      // Seeking backwards has to bring the marker back, so this is always
      // re-derived from currentTime rather than shrunk in place.
      const from = Math.max(start, currentTime);
      if (from >= end) {
        marker.style.display = 'none';
        continue;
      }

      let left = (from / duration) * barRect.width;
      const right = (end / duration) * barRect.width;

      if (knobRight !== null && knobRight > left && knobLeft < right) {
        left = Math.max(left, knobRight);
      }

      if (right - left <= 0) {
        marker.style.display = 'none';
        continue;
      }

      marker.style.display = 'block';
      marker.style.left = `${left}px`;
      marker.style.width = `${Math.max(right - left, 2)}px`;
    }
  }

  // fork: drawOverlay() calls stopMarkerObserver() as soon as it succeeds, so
  // once YouTube prunes our container (it always does — see getMarkerHost)
  // nothing was left watching to put it back. The skip poller already ticks
  // every 250ms for unrelated reasons; piggyback on it to re-attach when the
  // node is gone and to keep geometry/visibility in step otherwise. Redrawing
  // only when actually detached keeps this from flickering.
  maintainMarkers() {
    if (!this.active || !this.segments.length) return;

    const host = getMarkerHost();
    if (!host) return;

    if (!this.overlay || !host.contains(this.overlay)) {
      this.clearOverlay();
      this.checkForProgressBar();
      return;
    }

    const bar = findProgressBar();
    if (!bar) {
      this.progressBar = null;
      this.markerStatus = 'waiting-for-progress-bar';
      this.hideOverlay();
      return;
    }

    this.progressBar = bar;
    this.syncOverlayWithSegment();
  }

  // fork: this.overlay = null (previously scattered across reset/destroy/
  // loadVideo) only cleared the JS reference — the marker container stayed
  // in the DOM as a permanent sibling of the stable anchor. Since
  // findExistingOverlay() only ever matches the CURRENT videoID, a prior
  // video's leftover container was never found again, never removed, and
  // just stacked with every subsequent video change. Route every clear
  // through here so the DOM node is actually removed, not just forgotten.
  clearOverlay() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  // fork: the overlay outlives the bar it describes. It hangs off <body>, so
  // when the bar goes away entirely (leaving the video for the browse UI) the
  // markers would otherwise stay painted over whatever is on screen now:
  // syncOverlayWithSegment() can't help, since it early-returns once
  // progressBar is null and never reaches its hide path. Keep the node —
  // findExistingOverlay() reuses it if the same video's bar comes back — and
  // just take it off screen.
  hideOverlay() {
    if (this.overlay) this.overlay.style.display = 'none';
  }

  findExistingOverlay() {
    const parent = getMarkerHost();
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
    const progressBar = findProgressBar();
    if (!progressBar) {
      this.progressBar = null;
      this.markerStatus = 'waiting-for-progress-bar';
      this.hideOverlay();
      return;
    }

    this.progressBar = progressBar;

    const existingOverlay = this.findExistingOverlay();
    if (existingOverlay) {
      this.overlay = existingOverlay;
      this.syncOverlayWithSegment();
      this.markerStatus = `rendered ${existingOverlay.children.length}`;
      this.stopMarkerObserver();
      return;
    }

    // Eine alte JS-Referenz kann übrig bleiben, obwohl YouTube den Knoten entfernt hat.
    this.clearOverlay();
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
    this.clearOverlay();
    this.progressBar = null;

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
    if (!this.progressBar || !this.segments.length) {
      this.markerStatus = this.segments.length ? 'waiting-for-progress-bar' : 'no-segments';
      return;
    }

    const existingOverlay = this.findExistingOverlay();
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

    const barRect = this.progressBar.getBoundingClientRect();
    const barWidth = this.progressBar.offsetWidth || barRect.width;

    if (!barWidth) {
      this.markerStatus = 'missing-progress-bar-width';
      return;
    }

    const host = getMarkerHost();
    if (!host) {
      this.markerStatus = 'waiting-for-marker-host';
      return;
    }

    const trackColor = window.getComputedStyle(this.progressBar).backgroundColor;

    const markerContainer = document.createElement('div');
    markerContainer.id = 'previewbar';
    markerContainer.setAttribute(markerContainerAttribute, 'true');
    markerContainer.setAttribute('data-ytaf-video-id', this.videoID || '');
    // fork: own the container's style outright. It used to copy className /
    // cssText off a player-internal element, which is both impossible now
    // (that element is gone) and wrong for a body-anchored fixed overlay.
    markerContainer.style.cssText =
      'position: fixed; pointer-events: none; z-index: 9999; display: block;';

    let renderedCount = 0;

    this.segments.forEach((segmentData) => {
      const start = Math.max(0, segmentData.segment[0]);
      const end = Math.min(duration, segmentData.segment[1]);
      if (end <= start) return;

      const marker = document.createElement('div');
      marker.setAttribute(markerAttribute, 'true');

      const left = (start / duration) * barWidth;
      const width = ((end - start) / duration) * barWidth;

      marker.style.cssText = 'position: absolute; top: 0; height: 100%;';
      marker.style.left = `${left}px`;
      marker.style.width = `${Math.max(width, 2)}px`;
      // fork: clipMarkersToProgress() re-derives the drawn span from these on
      // every tick, and reads them back off the node so a reused overlay
      // (findExistingOverlay) keeps working without any in-memory bookkeeping.
      marker.setAttribute('data-sb-start', String(start));
      marker.setAttribute('data-sb-end', String(end));
      marker.style.backgroundColor = blendUnderTrack(
        categoryColors[segmentData.category] || '#ffff00',
        trackColor
      );
      marker.title = categoryLabel(segmentData.category);
      markerContainer.appendChild(marker);
      renderedCount += 1;
    });

    if (!renderedCount) {
      this.markerStatus = 'no-valid-markers';
      return;
    }

    host.appendChild(markerContainer);

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
      // fork: clamp skips away from the video end — seeking to the end makes
      // Cobalt restart the video instead of ending it, which loops outro
      // skips forever (NicholasBly/youtube-webos#143). Only seek when it
      // moves playback forward; otherwise let the tail play out naturally.
      const duration = getVideoDuration(this.video, this.segments);
      const boundedEnd =
        duration > 0 ? Math.min(skipEnd, Math.max(duration - 0.35, 0)) : skipEnd;
      if (boundedEnd > this.video.currentTime + 0.05) {
        this.lastSkipText = `${activeSegments[0].category} ${start.toFixed(
          1
        )}-${boundedEnd.toFixed(1)}`;
        this.video.currentTime = boundedEnd;
        showNotification(`${text('sponsorBlock', 'skipping')} ${categoryLabel(activeSegments[0].category)}`, 1600, 'yellow');
        this.scheduleSkip();
      }
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
        this.maintainMarkers();
      } catch (err) {
        console.warn('[SponsorBlock] skip poll failed:', err);
      }
    }, 250);
  }
}
